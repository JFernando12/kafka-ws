import { v4 as uuidv4 } from 'uuid';
import { WebSocketServer, WebSocket } from 'ws';
import { Kafka, logLevel } from 'kafkajs';
import { getCurrencyFromAddress, sendSocketMessage } from './utils';
import { KafkaTopics, WebSocketEvents } from './events';

const KAFKA_BROKER = process.env.KAFKA_BROKER!;

const kafka = new Kafka({ brokers: [KAFKA_BROKER], logLevel: logLevel.ERROR });
const producer = kafka.producer();

// All server instances should receive all prices and balance updates.
// Publish-Subscribe pattern is a good fit for this requirement.
const priceConsumerGroupId = `server-price-${uuidv4()}`;
const balanceConsumerGroupId = `server-balance-${uuidv4()}`;

const priceConsumer = kafka.consumer({ groupId: priceConsumerGroupId });
const balanceConsumer = kafka.consumer({ groupId: balanceConsumerGroupId });

const socketServer = new WebSocketServer({ port: 3000 });
const clients = new Map<string, WebSocket>(); // socketId -> socket
const clientWallets = new Map<string, { address: string, currency: string }>(); // socketId -> wallet
const walletBalances = new Map<string, number>(); // address -> balance
const prices: Record<string, number | null> = { btc: null, eth: null };

const pleaseCrawlBalance = async (address: string, currency: string) => {
    const payload = JSON.stringify({ address, currency });
    await producer.send({
        topic: KafkaTopics.TaskToReadBalance,
        messages: [{ key: address, value: payload }],
    });
};

const notifyClientsAboutPriceUpdate = (currency: string, price: number) => {
    clients.forEach((socket, sockedId) => {
        const wallet = clientWallets.get(sockedId);
        if (wallet?.currency !== currency) return;
        sendSocketMessage(socket, WebSocketEvents.PriceUpdated, { currency, price });
    });
};

const notifyClientsAboutBalanceUpdate = (address: string, balance: number) => {
    clientWallets.forEach((wallet, socketId) => {
        if (wallet.address !== address) return;
        const socket = clients.get(socketId);
        if (!socket) return;
        sendSocketMessage(socket, WebSocketEvents.BalanceUpdated, { balance });
    });
};

const main = async () => {
    await producer.connect();
    await priceConsumer.connect();
    await balanceConsumer.connect();

    await priceConsumer.subscribe({ topic: KafkaTopics.CurrencyPrice, fromBeginning: false });
    await balanceConsumer.subscribe({ topic: KafkaTopics.WalletBalance, fromBeginning: false });

    await priceConsumer.run({
        eachMessage: async ({ message }) => {
            const { price } = JSON.parse(message.value!.toString());
            const currency = message.key!.toString();
            prices[currency] = price;

            notifyClientsAboutPriceUpdate(currency, price);
        }
    });

    await balanceConsumer.run({
        eachMessage: async ({ message }) => {
            const { balance } = JSON.parse(message.value!.toString());
            const address = message.key!.toString();
            walletBalances.set(address, balance);

            notifyClientsAboutBalanceUpdate(address, balance);
        }
    });

    socketServer.on('connection', (socket) => {
        const socketId = uuidv4();
        clients.set(socketId, socket);

        socket.on('message', async (payload: string) => {
            const { type, data } = JSON.parse(payload);
            console.log('[message from client]', { socketId, type, data });

            switch (type) {
                case WebSocketEvents.SetupWallet:
                    const address = data;
                    const currency = getCurrencyFromAddress(address);
                    clientWallets.set(socketId, { address, currency });

                    const price = prices[currency];
                    if (price) notifyClientsAboutPriceUpdate(currency, price);

                    const balance = walletBalances.get(address);
                    if (balance) notifyClientsAboutBalanceUpdate(address, balance);
                    else pleaseCrawlBalance(address, currency);

                    break;
                case WebSocketEvents.ReadBalance:
                    const wallet = clientWallets.get(socketId);
                    if (!wallet) return;
                    pleaseCrawlBalance(wallet.address, wallet.currency);
                    break;
            };
        });
    });

    process.on('SIGTERM', () => {
        socketServer.close(async () => {
            await producer.disconnect();
            await priceConsumer.disconnect();
            await balanceConsumer.disconnect();
            await kafka.admin().deleteGroups([priceConsumerGroupId, balanceConsumerGroupId]);
            process.exit(0);
        });
    });

    console.log('Started server on ws://localhost:3000');
};

main().catch(console.error);