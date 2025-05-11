#!/bin/sh

echo "Starting certificate renewal check..."

# 먼저 인증서 만료 임박 여부만 확인
CERT_EXPIRY=$(docker-compose run --rm --entrypoint "certbot certificates" certbot | grep "VALID:" | awk '{print $6}')

if [ "$CERT_EXPIRY" -lt "30" ]; then
   echo "Certificate will expire soon. Proceeding with renewal..."
   
   echo "Stopping nginx..."
   docker-compose stop nginx
   sleep 5
   
   echo "Attempting to renew certificates..."
   docker-compose run --rm -p 80:80 --entrypoint "certbot renew --no-self-upgrade --non-interactive" certbot
   
   echo "Restarting nginx..."
   docker-compose up -d nginx
else
   echo "Certificate is still valid for $CERT_EXPIRY days. No renewal needed."
fi

echo "Renewal check completed."
