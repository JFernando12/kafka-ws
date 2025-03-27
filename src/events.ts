export enum WebSocketEvents {
    // From client to server
    SetupWallet = 'setup-wallet',
    ReadBalance = 'read-balance',

    // From server to client
    BalanceUpdated = 'balance-updated',
    PriceUpdated = 'price-updated',
}

export enum KafkaTopics {
    TaskToReadBalance = 'task_to_read_balance',
    WalletBalance = 'wallet_balance',
    CurrencyPrice = 'currency_price',
}