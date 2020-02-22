#!/usr/bin/dumb-init /bin/bash
echo "TF2-Automatic Pre-launch checks starting..."

# Ripped from Linuxserver.io baseimages.
echo "Changing user id to $PUID:$PGID..."
PUID=${PUID:-911}
PGID=${PGID:-911}
groupmod -o -g "$PGID" user
usermod -o -u "$PUID" user

echo "Fixing permissions..."
chown -R user:user /app
chown -R user:user /files
chown -R user:user /defaults
chown -R user:user /logs

echo "Securing logs and config..."
find /files -type d -exec chmod 700 {} \;
find /files -type f -exec chmod 600 {} \;

echo "Pre-launch setup done. Starting PM2..."
su -s /bin/bash -c 'export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin && cd /app && pm2-runtime start ecosystem.json' user

