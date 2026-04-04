module.exports = {
  apps: [
    {
      name: "ai-call-app",
      script: "npm",
      args: "start",
      cwd: "./ai-call-app",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      }
    },
    {
      name: "ai-call-backend",
      script: "node",
      args: "server.js",
      cwd: "./ai-call-backend",
      env: {
        NODE_ENV: "production",
        PORT: 5000,
      }
    }
  ]
};
