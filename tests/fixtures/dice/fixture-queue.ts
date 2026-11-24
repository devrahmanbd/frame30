eventBus.subscribe("order.created", async (msg) => { handleFulfillment(msg); });
