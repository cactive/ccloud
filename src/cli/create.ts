#!/usr/bin/env node

import ora from "ora";
import meow from "meow";
import chalk from "chalk";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "fs";
import { exec } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const templates = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../data/cli_templates.json'), 'utf8')) as { [key: string]: string[] };

const cli = meow(
    `
    Usage
        $ ${chalk.blueBright("ccloud-create")} <location> --template <template>
    
    Options
        --help, -h      Show help
        --template, -t  Template name
        --version, -v   Show version

    Examples
        $ ${chalk.blueBright("ccloud-create")} ${chalk.cyanBright('./ccloud-demo')} --template=${chalk.blueBright('react')}
    `,
    {
        importMeta: import.meta,
        flags: {
            help: {
                type: "boolean",
                alias: "h"
            },
            template: {
                isRequired: true,
                type: "string",
                alias: "t"
            },
            version: {
                type: "boolean",
                alias: "v"
            }
        }
    }
);

// get location to create project
const location = cli.input[0];
if (!location) {
    console.log(chalk.redBright("Please provide a location to create project"));
    console.log(cli.help);
    process.exit(1);
}

// get template for project
const template = cli.flags.template;

// ensure template exists
if (!templates[template.toLowerCase()]) {
    console.log(chalk.redBright("Template does not exist"));
    console.log(cli.help);
    process.exit(1);
}

// create folder for project if it doesn't exist
let folder_spinner = ora("Creating project folder").start();

// ensure folder is empty, if exists
if (existsSync(location) && readdirSync(location).length > 0) {
    folder_spinner.fail("Project folder is not empty");
    process.exit(1);
}

// create folder if not
if (!existsSync(location)) {
    mkdirSync(location);
    folder_spinner.succeed("Project folder created");
} else folder_spinner.succeed("Empty folder already exists");

// load template
let logs: string[] = [];
let command_spinner = ora("Loading template").start();
const template_commands = templates[template.toLowerCase()];

for (let command of template_commands) {
    logs = [];
    command_spinner.text = `Running template command (${template_commands.indexOf(command) + 1}/${template_commands.length})`;
    await new Promise<void>(resolve =>
        exec(command.replace('$l', location))
            .on("exit", resolve)
            .stdout?.on("data", data => {
                if (data.trim() === '') return;
                logs.push(data.toString().replace(/\n$/, '').trim());
                command_spinner.text = `Running template command (${template_commands.indexOf(command) + 1}/${template_commands.length})\n${logs.map(l => `\t>\t${l}`).join('\n')}`;
            })
    );
};

command_spinner.succeed("Template loaded");

// all done!
console.log(chalk.greenBright("Project created successfully"));
console.log(chalk.greenBright("To create a new project, run ccloud publish"));