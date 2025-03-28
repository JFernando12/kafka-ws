import axios from 'axios';
import { Kafka, logLevel } from 'kafkajs';
import { KafkaTopics } from './events';

const BLOCKCYPHER_API_URL = 'https://api.blockcypher.com/v1';
const BLOCKCYPHER_TOKEN = process.env.BLOCKCYPHER_TOKEN;
const KAFKA_BROKER = process.env.KAFKA_BROKER!;

const kafka = new Kafka({
    brokers: [KAFKA_BROKER],
    logLevel: logLevel.ERROR,
});
const producer = kafka.producer();

// Same groudId for all instances to load balance the tasks
// Message-Queue pattern
const groupId = 'balance-crawler';
const taskConsumer = kafka.consumer({ groupId });

const getWalletBalance = async (currency: string, address: string) => {
    let url = `${BLOCKCYPHER_API_URL}/${currency}/main/addrs/${address}/balance`;
    if (BLOCKCYPHER_TOKEN) url += `?token=${BLOCKCYPHER_TOKEN}`;

    const { data } = await axios.get(url);

    if (currency === 'btc') return data.final_balance / 1e8;
    if (currency === 'eth') return data.balance / 1e18;            
};

const main = async () => {
    await producer.connect();
    await taskConsumer.connect();

    await taskConsumer.subscribe({ topic: KafkaTopics.TaskToReadBalance, fromBeginning: false });

    console.log('Balance crawler is running...');

    await taskConsumer.run({
        eachMessage: async ({ message }) => {
            const { address, currency } = JSON.parse(message.value!.toString());
            const balance = await getWalletBalance(currency, address);

            const payload = JSON.stringify({ balance });
            await producer.send({
                topic: KafkaTopics.WalletBalance,
                messages: [{ key: address, value: payload }]
            });
        }
    });
};

main().catch(console.error);
