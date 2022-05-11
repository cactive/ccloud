export type CloudConfig = {
    project_id: string
    api_token: string

    build_command?: string
    build_file?: string

    cloud_paths?: {
        functions?: string
    }
}