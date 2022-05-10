export type CloudConfig = {
    cloud_project_id: string
    cloud_api_token: string
    build_directory: string

    cloud_paths?: {
        functions?: string
    }
}