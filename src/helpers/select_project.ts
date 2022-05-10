import chalk from "chalk";
import fetch from "node-fetch";
import express, { Express } from "express";
const porter = require('node-porter');

export default function fetch_details(): Promise<{ api_token: string, project_id: string }> {
    return new Promise((resolve) => {
        porter((err: string | undefined, port: number) => {
            if (err) {
                console.log(chalk.redBright('Unable to open server: ' + err));
                process.exit(1);
            }

            let app: Express | null = express();
            app.listen(port, () => console.log(chalk.greenBright(`Connect your account at https://cactive.cloud/dashboard/connect?redirect=http://localhost:${port}/connect`)));

            app.get('/connect', (req, res) => {
                if (!req.query.code) return res.send('No code provided');
                res.send("Return to the terminal to continue");
                app = null;

                // fetch()
            })

        })
    })
}