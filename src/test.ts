import chalk from 'chalk';
import 'dotenv/config';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import fetch, { File, FormData } from 'node-fetch'

const { API_KEY, PROJECT_ID } = process.env;
if (!API_KEY || !PROJECT_ID) {
    console.log(chalk.redBright("Please provide an 'API_KEY' & 'PROJECT_ID' environment variables"));
    process.exit(1);
}

if (!existsSync(resolve('./build.zip'))) {
    console.log(chalk.redBright("Please build the project first"));
    process.exit(1);
}

export const upload = (path: string, api_token: string, project_id?: string) => new Promise<{ id: string, _subdomain: string }>((resolve, reject) => {

    console.log('Creating form data')
    const data = new FormData();

    console.log('Constructing binary file')
    const binary = new Uint8Array(readFileSync(path));

    console.log('Formatting binary file')
    const upload = new File([binary], 'upload.zip', { type: 'application/zip' });

    console.log('Appending binary file to form data')
    data.append('file', upload);

    console.log('Sending request')
    fetch(`https://api.cactive.cloud/api/upload${project_id ? `?id=${project_id}` : ''}`, {
        method: 'POST',
        headers: {
            'Authorization': `API ${api_token}`,
        },
        body: data,
    })
        .then(res => {
            console.log('Response received')
            return res.text()
        })
        .then(res => {

            console.log('Parsing response')

            let data;
            try { data = JSON.parse(res); }
            catch {
                console.log(chalk.redBright('Unable to parse response'));
                reject(res);
            }

            console.log('Resolving promise')
            resolve(data);
        })
        .catch(err => {
            console.log(chalk.redBright('Unable to send request'));
            console.log(err);
            reject(err);
        })

})

upload(resolve('./build.zip'), API_KEY, PROJECT_ID)

