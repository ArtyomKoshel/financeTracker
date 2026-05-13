FROM nginx:alpine

RUN rm -f /etc/nginx/conf.d/default.conf
# DEV: фронтенд через Vite (hot reload)
COPY nginx/default-dev.conf /etc/nginx/conf.d/default.conf
