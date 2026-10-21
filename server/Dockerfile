FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY index.js roomDirectory.js ./

ENV NODE_ENV=production
ENV PORT=9000
ENV PEER_PATH=/signaling
ENV PEER_KEY=peerjs

EXPOSE 9000

CMD ["node", "index.js"]
