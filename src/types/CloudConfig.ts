export type CloudConfig = {
    project_id: string
    api_token: string

    build_command?: string
    build_folder?: string

    cloud_paths?: {
        functions?: string
    }
}