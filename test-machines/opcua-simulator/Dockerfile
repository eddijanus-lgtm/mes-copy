FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node test-machines/opcua-simulator/real-plc-clone.js ./real-plc-clone.js

ENV NODE_ENV=production \
    OPC_UA_TEST_SERVER_PORT=4840 \
    OPC_UA_SERVER_HOST=127.0.0.1

USER node

EXPOSE 4840

HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=5 \
  CMD ["node", "-e", "const net=require('net');const s=net.connect(4840,'127.0.0.1',()=>{s.end();process.exit(0)});s.setTimeout(2000,()=>{s.destroy();process.exit(1)});s.on('error',()=>process.exit(1))"]

CMD ["node", "real-plc-clone.js"]
