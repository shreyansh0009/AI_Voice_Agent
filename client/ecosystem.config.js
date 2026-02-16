module.exports = {
  apps: [
    {
      name: 'vps-server',
      script: './server/app.js',
      env: {
        NODE_ENV: 'production',
        PORT: 5001
      }
    },
    {
      name: 'vps-client',
      script: 'npm',
      args: 'run dev -- --host',
      cwd: './client'
    }
  ]
};