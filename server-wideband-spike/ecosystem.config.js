export default {
  apps: [
    {
      name: "voice-wideband-spike",
      script: "app.js",
      cwd: ".",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "development",
        PORT: 5101,
      },
    },
  ],
};
