module.exports = {
  apps: [
    {
      name: "ariha-workhub",
      script: "node_modules/.bin/next",
      args: "start",
      cwd: "/var/www/ariha-workhub",
      instances: "max",
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      error_file: "/var/log/pm2/ariha-workhub-error.log",
      out_file: "/var/log/pm2/ariha-workhub-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
    {
      name: "ariha-cron",
      script: "scripts/cron.js",
      cwd: "/var/www/ariha-workhub",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
