import WebSocket from "ws";
import readline from "readline";
import { WebSocketEvents } from "./events";

export const setupKeyListener = (handlers: { onEnter: () => void; onClose: () => void }) => {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);

    process.stdin.on('keypress', (_str, key) => {
        if (key.ctrl && key.name === 'c') handlers.onClose();
        else if (key.name === 'return') handlers.onEnter();
    });
};

export const sendSocketMessage = <T>(socket: WebSocket, type: string, data?: T) => {
    if (socket.readyState === socket.CLOSED) return;
    const message = JSON.stringify({ type, data: data || null });
    socket.send(message);
};

export const loadWalletBalanceLoop = (socket: WebSocket, seconds: number) => {
    setTimeout(() => {
        if (socket.readyState === socket.CLOSED) return;
        sendSocketMessage(socket, WebSocketEvents.ReadBalance);
        loadWalletBalanceLoop(socket, seconds);
    }, seconds * 1000);
};

export const formatUSD = (amount: number) => {
    const format = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    return format.format(amount);
};

export const printBalance = (currency: string, price?: number, balance?: number) => {
    process.stdout.write(`Wallet:  ${currency.toUpperCase()}\n`)
    process.stdout.write(`Price:   ${price ? formatUSD(Number(price)) : '...'}\n`)
    process.stdout.write(`Balance: ${balance || '...'}\n`)
    process.stdout.write(`Value:   ${balance !== undefined && price ? formatUSD(balance * price) : '...'}\n`)
  
    process.stdout.moveCursor(0, -4);
};

export const getCurrencyFromAddress = (address: string) => {
    return address.startsWith('0x') ? 'eth' : 'btc';
};