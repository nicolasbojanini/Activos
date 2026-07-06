# Envuelve la imagen pública de MinIO solo para fijar el comando de arranque
# — más simple y confiable que pelear con la config de "start command" de un
# servicio basado en imagen en Railway; este Dockerfile usa el mismo
# mecanismo (RAILWAY_DOCKERFILE_PATH) que apps/api y apps/web.
FROM minio/minio:latest
EXPOSE 9000 9001
CMD ["server", "/data", "--console-address", ":9001"]
