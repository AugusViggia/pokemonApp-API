const { Router } = require('express');
const { getTypesHandler } = require('../handlers/TypeHandlers/TypeHandlersGet');

const typeRouter = Router();

typeRouter.get('/', getTypesHandler);

module.exports = typeRouter;