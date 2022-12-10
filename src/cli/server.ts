import { execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { App, createApp, createRouter, eventHandler, fromNodeMiddleware, getHeaders, getQuery, readBody, toNodeListener } from 'h3';
import { join, resolve } from 'path';
import { watch } from 'chokidar';
import chalk from "chalk";
import fse from 'fs-extra';
import { createServer, Server } from 'http';
import ora, { Ora } from 'ora';
import { pathToFileURL } from 'url';
import fetch from 'node-fetch';
import { createHttpTerminator } from 'http-terminator';


const { copySync } = fse;

let app: App | null = null;
let spinner: Ora | null = null;
let server: Server | null = null;
const port = process.env.PORT || 4646;

const router = createRouter();

/* —————————————————————————————————————————— */

const methods_with_body = [
    'POST',
    'PUT',
    'PATCH'
];

const tsconfig = {
    "exclude": [
        "dist"
    ],
    "compilerOptions": {
        "target": "esnext",
        "module": "commonjs",
        "esModuleInterop": true,
        "rootDir": ".",
        "outDir": "./dist",
        "skipLibCheck": true,
        "resolveJsonModule": true,
    }
};

const npmpackage = {
    "name": "cloud-dev-env",
    "private": true,
    "dependencies": [],
    "devDependencies": []
};

/* —————————————————————————————————————————— */

const cold = (functions_folder: string, digest: any) => {
    if (existsSync(join(functions_folder, '.live/'))) {
        spinner = ora(`Removing old test environment from '${functions_folder}'`).start();
        rmSync(join(functions_folder, '.live/'), { recursive: true });
    }

    mkdirSync(join(functions_folder, '.live/'));
    spinner!.succeed();

    spinner = ora("Writing configs").start();
    writeFileSync(join(functions_folder, '.live/tsconfig.json'), JSON.stringify(tsconfig, null, 4));
    writeFileSync(join(functions_folder, '.live/package.json'), JSON.stringify(npmpackage, null, 4));
    spinner!.succeed();

    if (digest.modules) {
        spinner = ora("Installing prerequisites").start();
        for (let module of digest.modules) {
            spinner!.text = `Installing ${module}`;
            execSync(`npm install ${module} --no-scripts ${module.replace(/@[^/]+?$/, '')}`, { cwd: join(functions_folder, '.live/') });
        }
        spinner!.succeed();
    }

    warm(functions_folder, digest);
}

const warm = async (functions_folder: string, digest: any) => {
    spinner = ora("Copying functions to test environment").start();
    readdirSync(functions_folder)
        .forEach(file => {
            if (file === '.live') return;
            spinner!.text = `Copying ${file}`;
            copySync(join(functions_folder, file), join(functions_folder, '.live', file));
        })
    spinner!.succeed(`Copied ${readdirSync(join(functions_folder, '.live')).length} functions`);

    if (existsSync(join(functions_folder, '.live/dist'))) {
        spinner = ora("Rebuilding dist cleanly").start();
        rmSync(join(functions_folder, '.live/dist'), { recursive: true });
        spinner!.succeed(`Old dist cleaned`);
    }

    spinner = ora("Building functions").start();
    execSync('npx -y tsc -p .', { cwd: join(functions_folder, '.live') });
    spinner!.succeed();

    app = createApp();
    for (let file of readdirSync(join(functions_folder, '.live/dist/'))) {

        if (!file.endsWith('.js')) continue;
        const route = await import(pathToFileURL(join(resolve('./'), functions_folder, '.live/dist/', file)).toString());

        let location = route.route || file.split('.').slice(0, -1).join('.');
        if (location === 'index') location = '';
        if (!location.startsWith('/')) location = `/${location}`;
        if (digest['routeless'] && Array.isArray(digest['routeless']) && digest['routeless'].includes(location)) continue;

        let def = route.default;
        if (def.default) def = def.default;
        if (!def) {
            console.log(chalk.redBright(`Skipping ${file} because it doesn't export a default function`));
            continue;
        }

        let method = (route.method || 'get').toLowerCase();
        if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
            console.log(chalk.red(`Invalid method '${method}' for route '${location}', defaulting to 'get'`));
            method = 'get';
        }

        try {
            spinner = ora(`Registering route file ${file} for ${route.method || 'get'} @ '${location}'`).start();
            router[(route.method || 'get') as 'get'](location, eventHandler(async (e: any) => {

                const s = Date.now();
                console.log(chalk.gray(`[${method.toUpperCase()} :: ${location} :: HIT]`));

                try {

                    let response = def({
                        query: getQuery(e),
                        body: methods_with_body.includes(method) ? readBody(e) : null,
                        headers: getHeaders(e),
                    });

                    if (response instanceof Promise) {
                        response = await response;
                    }

                    console.log(chalk.greenBright(`[${method.toUpperCase()} :: ${location} :: ${Date.now() - s}ms] <Response: ${JSON.stringify(response).length} characters>`));
                    return response;

                } catch (e) {
                    console.log(chalk.redBright(`[${method.toUpperCase()} :: ${location} :: ${Date.now() - s}ms] ${e}`));
                    return '500 Internal Server Error';
                }

            }))

            spinner!.succeed();
        } catch (e) {
            spinner!.fail(`Failed to register route file ${file} for ${location}\n${e}`);
        }

    }

    app.use(fromNodeMiddleware((i, o, n) => {
        o.setHeader('Access-Control-Allow-Origin', '*');
        o.setHeader('Access-Control-Allow-Headers', '*');
        o.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
        o.setHeader('Access-Control-Max-Age', '86400');

        if (i.method === 'OPTIONS') {
            o.writeHead(200);
            o.end();
            return;
        }

        n();
    }));

    app.use(router);

    if (server) {
        spinner = ora("Restarting server").start();
        const httpTerminator = createHttpTerminator({ server });
        await httpTerminator.terminate();
        spinner!.succeed();
    }

    server = createServer(toNodeListener(app)).listen(port, () =>
        console.log(chalk.underline(chalk.blueBright(`\n${chalk.white(chalk.bold('>>>>'))} Server ready (${chalk.gray(':' + port)})\n`))));

}

const proxy = async (api_key: string, project_id: string, created = false) => new Promise<void>(resolve => {

    spinner = ora(created ? "Updating proxy through Cloud" : "Creating proxy through Cloud").start();
    fetch(`https://api.cactive.cloud/api/proxy`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": 'API ' + api_key
        },
        body: JSON.stringify({
            project_id,
            port
        })
    })
        .then(async res => ({ ...((await res.json()) as any), success: res.status === 200, status: res.status + ': ' + res.statusText }))
        .then((res: any) => {
            if (res.success) {
                spinner!.succeed(res.message);
                resolve();

                if (!created) setInterval(() => proxy(api_key, project_id, true), 25 * 60 * 1000);
            }
            else {
                spinner!.fail("Failed to proxy connection");
                console.log(res.message || status);
                process.exit(1);
            }
        })
        .catch(e => {
            spinner!.fail("Failed to connect to Cloud");
            console.log(e.message || e);
            process.exit(1);
        })
})

export const unproxy = async (api_key: string, project_id: string) => new Promise<void>(resolve => {

    spinner = ora("Stopping remote proxy").start();
    fetch(`https://api.cactive.cloud/api/unproxy`, {
        method: "POST",
        headers: {
            "Authorization": 'API ' + api_key,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            project_id
        })
    })
        .then(async res => ({ ...((await res.json()) as any), success: res.status === 200, status: res.status + ': ' + res.statusText }))
        .then((res: any) => {
            if (res.success) {
                spinner!.succeed(res.message);
                resolve();
                process.exit(0)
            }
            else {
                spinner!.fail("Failed to un-proxy connection. Run 'ccloud unproxy' or expiry will occur in <30m");
                console.log(res.message || res.status);
                process.exit(1);
            }
        })
        .catch(e => {
            spinner!.fail("Failed to un-proxy connection. Retry, or expiry will occur in <30m");
            console.log(e.message || e);
            process.exit(1);
        })
})

/* —————————————————————————————————————————— */

export default async (functions_folder: string, api_key: string, project_id: string) => {

    await proxy(api_key, project_id);

    const calculate_digest = () => existsSync(join(functions_folder, 'digest.json')) ? JSON.parse(readFileSync(join(functions_folder, 'digest.json'), 'utf8')) : {};
    let digest = calculate_digest();

    cold(functions_folder, digest);
    const watcher = watch(functions_folder, {
        ignored: /(^|[\/\\])\../,
        persistent: true,
        ignoreInitial: true
    })

    const rebuild = (file: string) => file.endsWith('digest.json') ?
        (() => { console.clear(); console.log(chalk.blueBright(`'${chalk.whiteBright(file)}' changed, restarting.\n`)); digest = calculate_digest(); cold(functions_folder, digest) })() :
        (() => { console.clear(); console.log(chalk.blueBright(`'${chalk.whiteBright(file)}' changed, reloading.\n`)); warm(functions_folder, digest) })();

    watcher
        .on('add', rebuild)
        .on('change', rebuild)
        .on('unlink', rebuild)

    process.on('SIGINT', async () => {
        watcher.close();
        await unproxy(api_key, project_id);
    })

}