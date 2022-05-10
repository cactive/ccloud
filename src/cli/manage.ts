#!/usr/bin/env node

import enquirer from "enquirer";
import chalk from "chalk";
import { existsSync, writeFileSync } from "fs";
import { join } from "path";

const { prompt } = enquirer;

if (!existsSync(join('./cloud.config.json'))) {

    console.log(chalk.blueBright("No cloud.config.json found."));
    const { confirm } = await prompt({
        type: 'confirm',
        name: 'confirm',
        message: 'Do you want to create a cloud.config.json file?'
    }) as any;

    if(!confirm) process.exit(0);
    

}