import WebSocket from 'ws';
import { WebSocketEvents } from './events';
import { getCurrencyFromAddress, loadWalletBalanceLoop, printBalance, sendSocketMessage, setupKeyListener } from './utils';

const socket = new WebSocket('ws://localhost:3000');
const address = process.argv[2];
const currency = getCurrencyFromAddress(address);
let balance: number | undefined;
let price: number | undefined;

const shutdown = () => {
    Array.from({ length: 4 }).forEach(() => process.stdout.write('\n'));
    socket.close();
    process.exit(0);
};

socket.on('open', () => {
    sendSocketMessage(socket, WebSocketEvents.SetupWallet, address);

    setupKeyListener({
        onEnter: () => sendSocketMessage(socket, WebSocketEvents.ReadBalance),
        onClose: () => shutdown()
    });

    loadWalletBalanceLoop(socket, 60);
});

socket.on('message', (json: string) => {
    const { type, data } = JSON.parse(json);

    switch (type) {
        case WebSocketEvents.BalanceUpdated:
            balance = data.balance;
            printBalance(currency, price, balance);
            break;
        case WebSocketEvents.PriceUpdated:
            price = data.price;
            printBalance(currency, price, balance);
            break;
    };
});

socket.on('close', () => shutdown());