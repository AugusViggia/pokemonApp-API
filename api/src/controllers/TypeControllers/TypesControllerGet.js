const { Type } = require("../../db");
const axios = require("axios");
require("dotenv").config();
const { API_URL } = process.env;

const getTypes = async () => {
    const dataBaseTypesRaw = await Type.findAll();
    const dataBaseTypes = dataBaseTypesRaw.map((type) => type.dataValues);

    if (dataBaseTypes.length === 0) {
        const apiTypesRaw = (await axios(`${API_URL}/type`)).data.results;
        const apiTypes = apiTypesRaw.map((type) => {
            return { name: type.name };
        });
        const fullTypes = await Type.bulkCreate(apiTypes);

        return fullTypes;
    }

    return dataBaseTypes;
};

module.exports = {
    getTypes,
};
