import chalk from "chalk";
import fetch from "node-fetch";
import express, { Express } from "express";
import enquirer from "enquirer";

const { prompt } = enquirer;

// @ts-ignore
import porter from 'node-porter';
import ora from "ora";
import { upload } from "./upload.js";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync, writeFileSync } from "fs";

export function fetch_details(): Promise<{ api_token: string, project_id: string }> {
    return new Promise(async (resolve) => {

        if (existsSync(join('./cloud.config.json'))) {
            const { api_token } = JSON.parse(readFileSync(join('./cloud.config.json'), 'utf8'));
            if (api_token) return resolve(await get_data(api_token));
        }

        let pairing = true;
        porter((err: string | undefined, port: number) => {
            if (err) {
                console.log(chalk.redBright('Unable to open server: ' + err));
                process.exit(1);
            }

            let app: Express | null = express();
            let spinner = ora(`Awaiting connection from cactive.cloud`);

            app.listen(port, () => {
                console.log(chalk.greenBright(`Connect your account at https://cactive.cloud/dashboard/connect?redirect=http://localhost:${port}/connect`));
                spinner.start();
            });

            app.get('/connect', async (req, res) => {
                if (!pairing) return res.send('Pairing already completed');
                if (!req.query.code) return res.send('No code provided');
                res.send("Return to the terminal to continue");

                pairing = false;
                app = null;

                spinner.succeed('Connected to cactive.cloud');
                spinner = ora(`Writing API token to config`);

                let data: any = {};
                if (existsSync(join('./cloud.config.json'))) data = JSON.parse(readFileSync(join('./cloud.config.json'), 'utf8'));
                data.api_token = req.query.code.toString() ?? '';
                writeFileSync(join('./cloud.config.json'), JSON.stringify(data, null, 4));

                resolve(await get_data(req.query.code.toString() ?? ''));
            })
        })
    })
}

const get_data = (api_token: string) => new Promise<{ api_token: string, project_id: string }>((resolve, reject) => {
    let spinner = ora(`Fetching project details`);

    fetch(`https://api.cactive.cloud/api/data`, {
        method: 'POST',
        headers: {
            'Authorization': `API ${api_token}`
        }
    })
        .then(res => res.text())
        .then(res => {

            let data;
            try { data = JSON.parse(res); }
            catch { return reject(res); }
            

            spinner.succeed('Project details fetched');
            const { projects } = data as { projects: { id: string, subdomain: string }[] };

            prompt({
                type: 'select',
                name: 'project',
                message: 'Select a project',
                choices: projects.map(project => project.subdomain).concat('Create a new project')
            })
                .then(({ project }: any) => {
                    if (project === 'Create a new project') {
                        spinner = ora(`Creating new project`);
                        upload(join(dirname(fileURLToPath(import.meta.url)), '../../data/placeholder.zip'), api_token)
                            .then(({ id, _subdomain: subdomain }) => {
                                spinner.succeed(`Project ${subdomain} created`);

                                resolve({
                                    api_token: api_token,
                                    project_id: id
                                });
                            })
                            .catch(err => {
                                spinner.fail(err);
                                process.exit(1);
                            })
                    } else {
                        console.log(chalk.greenBright(`Project ${project} selected`));
                        return resolve({
                            api_token: api_token,
                            project_id: projects.find(p => p.subdomain === project)!.id
                        })
                    }
                })
        })
        .catch(err => {
            spinner.fail('Unable to fetch project details');
            console.log(err);
            process.exit(1);
        })
})