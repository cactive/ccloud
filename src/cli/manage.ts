#!/usr/bin/env node
import chalk from "chalk";
import { createWriteStream, existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import meow from "meow";
import { fetch_details } from "../helpers/select_project.js";
import ora from "ora";
import { exec } from "child_process";
import { upload } from "../helpers/upload.js";
import archiver from "archiver";

const error = (reason: string) => {
    console.error(chalk.red(reason));
    process.exit(1);
}

const Tasks: { [key: string]: [string, ((config: { [key: string]: any }) => void)] } = {
    "init": ["Initialize a new project", async () => {
        console.log(chalk.blueBright("Initializing a new project"));
        fetch_details()
            .then(data => {
                let config = existsSync(join('./cloud.config.json')) ?
                    JSON.parse(readFileSync(join('./cloud.config.json'), 'utf8')) :
                    {};

                config.api_token = data.api_token;
                config.project_id = data.project_id;

                writeFileSync(join('./cloud.config.json'), JSON.stringify(config, null, 4));
                console.log(chalk.greenBright("Config saved"));
            })
            .catch(err => {
                console.log(chalk.redBright("Unable to initialize project"));
                console.log('\t' + err);
            });
    }],
    "deploy": ["Deploy or update a project", async ({ api_token, project_id, build_command, build_folder }) => {

        if (!api_token) error("No api_token found in config. Please run `cloud init` first");
        if (!project_id) error("No project_id found in config. Please run `cloud init` first");

        console.log(chalk.blueBright("Deploying project"));
        let spinner = ora("Building project").start();

        await new Promise<void>(resolve => {
            let logs: string[] = [];
            let command = build_command || "npm run build";
            exec(command)
                .on('exit', (code, signal) => {
                    if (code !== 0) {
                        spinner.fail(`Build failed running '${command}'`);
                        console.log(chalk.redBright(signal?.toString() || 'Process exited with code ' + code));
                        process.exit(1);
                    }

                    resolve();
                })
                .on('error', (err) => {
                    spinner.fail(chalk.red(`Build failed: ${err.message}`));
                    process.exit(1);
                }).stdout?.on("data", data => {
                    if (data.trim() === '') return;
                    logs.push(data.toString().replace(/\n$/, '').trim());
                    spinner.text = `${chalk.blueBright('Running')} ${command} \n${logs.map(l => `\t>\t${l}`).join('\n')}`;
                });
        })

        spinner.succeed("Build successful");
        spinner = ora("Zipping build folder").start();
        await new Promise<void>(resolve => {
            if (existsSync(join('./build.zip'))) unlinkSync(join('./build.zip'));

            const output = createWriteStream(join('./build.zip'));
            const archive = archiver('zip', { zlib: { level: 9 } });

            output.on('error', (err: any) => {
                spinner.fail('Zipping failed');
                console.log('\t' + err);
            });

            output.on('close', resolve);
            archive.pipe(output);

            archive.directory(join('./', build_folder ?? 'build'), false);
            archive.finalize();

        })

        spinner.succeed("Zipping successful");
        spinner = ora("Uploading to cloud").start();

        upload(join('./', 'build.zip'), api_token, project_id)
            .then(data => {
                spinner.succeed("Upload successful");
                console.log(chalk.greenBright("Project deployed successfully"));
                console.log(chalk.blueBright("Live at: "), `${chalk.cyanBright(`https://${data._subdomain}.cactive.cloud`)}`);
            })
            .catch(err => {
                spinner.fail(chalk.red(`Upload failed`));
                console.log('\t' + err);
                process.exit(1);
            })

    }]
};

const cli = meow(
    `
        Usage
            $ ${chalk.blueBright("ccloud")} <command> [args]
        
        Options
            --help, -h      Show help
            --version, -v   Show version
    
        Examples
            $ ${chalk.blueBright("ccloud")} ${chalk.cyanBright('init')}

        Commands
            ${chalk.blueBright('init')}\tInitialize a new project
            ${chalk.blueBright('deploy')}\tDeploy or update a project

        `,
    {
        importMeta: import.meta,
        flags: {
            help: {
                type: "boolean",
                alias: "h"
            },
            version: {
                type: "boolean",
                alias: "v"
            }
        },
    }
);

const args = cli.input;

if (!args[0]) {
    console.log(chalk.redBright("Please provide a command"));
    console.log(cli.help);
    process.exit(1);
}

if (Tasks[args[0]]) {
    Tasks[args[0]][1](
        existsSync(join('./cloud.config.json')) ?
            JSON.parse(readFileSync(join('./cloud.config.json'), 'utf8')) :
            {}
    );
}

else {
    console.log(chalk.redBright("Command not found"));
    console.log(cli.help);
    process.exit(1);
}
