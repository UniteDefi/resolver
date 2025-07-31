module.exports = {
  apps: [
    {
      name: "relayer",
      cwd: "./relayer",
      script: "npm",
      args: "run dev",
      env: {
        NODE_ENV: "development",
      },
    },
    {
      name: "resolver-0",
      cwd: "./service",
      script: "npm",
      args: "run start:enhanced-resolver",
      env: {
        RESOLVER_INDEX: "0",
      },
    },
    {
      name: "resolver-1",
      cwd: "./service",
      script: "npm",
      args: "run start:enhanced-resolver",
      env: {
        RESOLVER_INDEX: "1",
      },
    },
    {
      name: "resolver-2",
      cwd: "./service",
      script: "npm",
      args: "run start:enhanced-resolver",
      env: {
        RESOLVER_INDEX: "2",
      },
    },
    {
      name: "resolver-3",
      cwd: "./service",
      script: "npm",
      args: "run start:enhanced-resolver",
      env: {
        RESOLVER_INDEX: "3",
      },
    },
  ],
};