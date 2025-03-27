const { WebsocketStream } = require('@binance/connector')
import { Kafka, logLevel } from "kafkajs";
import { KafkaTopics } from "./events";

const BTC_USDT_TICKER = 'btcusdt';
const ETH_USDT_TICKER = 'ethusdt';
const KAFKA_BROKER = process.env.KAFKA_BROKER!;

const kafka = new Kafka({ brokers: [KAFKA_BROKER], logLevel: logLevel.ERROR });
const producer = kafka.producer();

const main = async () => {
    await producer.connect();
    
    const callbacks = {
        message: async (json: string) => {
            const {s, w} = JSON.parse(json);
            
            const currency = s.substring(0, 3).toLowerCase();
            const price = Number(w);

            const payload = JSON.stringify({ currency, price });
            console.log('Price:', payload);
            await producer.send({
                topic: KafkaTopics.CurrencyPrice,
                messages: [{ key: currency, value: payload }],
            });
        },
    };

    const websocketStreamClient = new WebsocketStream({ callbacks });
    websocketStreamClient.ticker(BTC_USDT_TICKER);
    websocketStreamClient.ticker(ETH_USDT_TICKER);

    console.log('Connected to Binance WebSocket');

    process.on('SIGTERM', async () => {
        websocketStreamClient.unsubscribe('bnbusdt@kline_1m')
        await producer.disconnect();

        process.exit(0);
    });
};

main().catch(console.error);