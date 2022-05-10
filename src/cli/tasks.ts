import { CloudConfig } from "../types/CloudConfig"

type Tasks = {
    [key: string]: {
        args: {
            type: string,
            name: string
        }[],
        run: (args: { config: CloudConfig, [key: string]: any }) => Promise<void>
    }
}

export const tasks: Tasks = {

    "publish": {
        args: [],
        run: async (): Promise<void> => {
            
        }
    }

}