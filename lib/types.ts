export interface Host {
    origin(): string;
    token(): Promise<string | undefined>;
    fetch(input: string, init?: RequestInit): Promise<Response>;
}
