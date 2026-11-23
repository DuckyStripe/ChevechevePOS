FROM postgres:16-alpine
RUN apk add --no-cache rclone tzdata
COPY respaldar.sh entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/respaldar.sh /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
