class FlowiseClient {
    baseURL: string;
    apiKey: string;

    constructor(baseURL: string, apiKey: string) {
        this.baseURL = baseURL;
        this.apiKey = apiKey;
    }

    async post(endpoint: string, body: Record<string, string>, headers: Record<string, string> = {"Content-Type": "application/json"}): Promise<any> {
        if (this.apiKey) {
            headers["Authorization"] = `Bearer ${this.apiKey}`;
        }
        const url = `${this.baseURL}${endpoint}`;
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body)
            });
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Request Error:', error);
            throw error;
        }
    }

    async initiateSession(flowId: string, inputValue: any, overrideConfig: any): Promise<any> {
        const endpoint = `/api/v1/prediction/${flowId}`;
        return this.post(endpoint, { question: inputValue, overrideConfig: overrideConfig });
    }

    async runFlow(flowIdOrName: string, inputValue: any, overrideConfig: any, onUpdate: (data: any) => void, onClose: (error: any) => void, onError: (error: any) => void) {
        try {
            const initResponse = await this.initiateSession(flowIdOrName, inputValue, overrideConfig);
            console.log('Init Response:', initResponse);
            return initResponse;
        } catch (error) {
            console.error('Error running flow:', error);
            onError('Error initiating session');
        }
    }
}

export default FlowiseClient;