/**
 * PONTO DE ENTRADA DO VERCEL SERVERLESS FUNCTION (os.eletrozone.net.br)
 * Redireciona todas as requisições API para a aplicação Express.
 */

const app = require('../server');

module.exports = app;
