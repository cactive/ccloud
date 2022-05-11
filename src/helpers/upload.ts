import { readFileSync } from 'fs';
import fetch, { File, FormData } from 'node-fetch'


export const upload = (path: string, api_token: string, project_id?: string) => new Promise<{ id: string, _subdomain: string }>((resolve, reject) => {

    const data = new FormData();

    const binary = new Uint8Array(readFileSync(path));
    const upload = new File([binary], 'upload.zip', { type: 'application/zip' });

    data.append('file', upload);

    fetch(`https://api.cactive.cloud/api/upload${project_id ? `?id=${project_id}` : ''}`, {
        method: 'POST',
        headers: { 'Authorization': `API ${api_token}` },
        body: data
    })
        .then(res => res.text())
        .then(res => {
            let data;
            try { data = JSON.parse(res); }
            catch { reject(res); }

            resolve(data);
        })

})