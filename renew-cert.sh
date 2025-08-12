#!/bin/sh

echo "Starting certificate renewal check..."

# docker-compose 전체 경로 설정
DOCKER_COMPOSE="/usr/local/bin/docker-compose"

# 인증서 상태 확인
CERT_INFO=$($DOCKER_COMPOSE run --rm --entrypoint "certbot certificates" certbot)
echo "Certificate info: $CERT_INFO"

# 만료된 인증서 확인
if echo "$CERT_INFO" | grep -q "EXPIRED"; then
    echo "Certificate has EXPIRED. Proceeding with renewal..."
    
    echo "Stopping nginx..."
    $DOCKER_COMPOSE stop nginx
    sleep 5
    
    echo "Attempting to renew certificates..."
    $DOCKER_COMPOSE run --rm -p 80:80 --entrypoint "certbot renew --force-renewal --no-self-upgrade --non-interactive" certbot
    
    echo "Restarting nginx..."
    $DOCKER_COMPOSE up -d nginx
    
    echo "Renewal completed."
else
    # 만료되지 않은 경우 남은 일수 확인
    CERT_EXPIRY=$(echo "$CERT_INFO" | grep "VALID:" | awk '{print $6}')
    
    # 숫자인지 확인
    if [ -n "$CERT_EXPIRY" ] && [ "$CERT_EXPIRY" -eq "$CERT_EXPIRY" ] 2>/dev/null; then
        if [ "$CERT_EXPIRY" -lt "30" ]; then
            echo "Certificate will expire soon (in $CERT_EXPIRY days). Proceeding with renewal..."
            
            echo "Stopping nginx..."
            $DOCKER_COMPOSE stop nginx
            sleep 5
            
            echo "Attempting to renew certificates..."
            $DOCKER_COMPOSE run --rm -p 80:80 --entrypoint "certbot renew --no-self-upgrade --non-interactive" certbot
            
            echo "Restarting nginx..."
            $DOCKER_COMPOSE up -d nginx
            
            echo "Renewal completed."
        else
            echo "Certificate is still valid for $CERT_EXPIRY days. No renewal needed."
        fi
    else
        echo "Unable to determine certificate validity. Forcing renewal..."
        
        echo "Stopping nginx..."
        $DOCKER_COMPOSE stop nginx
        sleep 5
        
        echo "Attempting to renew certificates..."
        $DOCKER_COMPOSE run --rm -p 80:80 --entrypoint "certbot renew --force-renewal --no-self-upgrade --non-interactive" certbot
        
        echo "Restarting nginx..."
        $DOCKER_COMPOSE up -d nginx
        
        echo "Forced renewal completed."
    fi
fi

echo "Renewal check completed."
