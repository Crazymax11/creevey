import { Configuration, DefinePlugin } from 'webpack';

export function config(entry: string[] = []): string[] {
  return [...entry, require.resolve('./decorator')];
}

console.log('123')
export function managerEntries(entry: string[] = []): string[] {
  return [...entry, require.resolve('./register')];
}

declare global {
  const __CREEVEY_SERVER_PORT__: number;
  const __CREEVEY_CLIENT_PORT__: number | null;
}
export interface CreeveyAddonOptions {
  creeveyPort?: number;
  clientPort?: number;
}
export function managerWebpack(config: Configuration, options: CreeveyAddonOptions): Configuration {
  config.plugins?.push(
    new DefinePlugin({
      __CREEVEY_SERVER_PORT__: options.creeveyPort ?? 3000,
      __CREEVEY_CLIENT_PORT__: options.clientPort,
    }),
  );
  return config;
}
