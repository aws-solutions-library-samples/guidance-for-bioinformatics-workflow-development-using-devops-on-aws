export interface DeployEnvironment {
  /**
   * Designated name of environment.
   * @example Dev, PreProd, Prod
   */
  name: string;
  env: {account: string, region: string}
}
