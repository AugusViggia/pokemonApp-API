//                       _oo0oo_
//                      o8888888o
//                      88" . "88
//                      (| -_- |)
//                      0\  =  /0
//                    ___/`---'\___
//                  .' \\|     |// '.
//                 / \\|||  :  |||// \\
//                / _||||| -:- |||||- \\
//               |   | \\\  -  /// |   |
//               | \_|  ''\---/''  |_/ |
//               \  .-\__  '-'  ___/-. /
//             ___'. .'  /--.--\  `. .'___
//          ."" '<  `.___\_<|>_/___.'' >' "".
//         | | :  `- \`.;`\ _ /`;.`/ - ` : | |
//         \  \ `_.   \_ __\ /__ _/   .-` /  /
//     =====`-.____`.___ \_____/___.-`___.-'=====
//                       `=---='
//                       ~~~~~~~~~
const server = require("./src/app.js");
const { conn, Pokemon } = require("./src/db.js");
const {
  schedulePokemonCatalogSync,
  SYNC_CHECK_INTERVAL_MS,
} = require("./src/services/pokeApiService.js");

conn
  .sync({ alter: true })
  .then(() => {
    const tableName = Pokemon.getTableName();
    return conn.query(`ALTER TABLE "${tableName}" ALTER COLUMN "image" TYPE TEXT`);
  })
  .then(() => {
    console.log("Pokemon image column is ready as TEXT");
    const port = process.env.PORT || 3001;
    server.listen(port, () => {
      console.log(`API listening at ${port}`);
      schedulePokemonCatalogSync();
      const syncTimer = setInterval(schedulePokemonCatalogSync, SYNC_CHECK_INTERVAL_MS);
      syncTimer.unref();
    });
  })
  .catch((error) => {
    console.error("Unable to prepare database:", error);
  });
