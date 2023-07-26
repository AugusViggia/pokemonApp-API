const { getTypes } = require("../../controllers/TypeControllers/TypesControllerGet");
const { Type } = require("../../db");

const OK = 200;
const err = 400;

const getTypesHandler = async (req, res) => {
    try {
        const apiTypes = await getTypes();
        console.log(apiTypes);

        for (let i = 0; i < apiTypes.length; i++) {
            const type = apiTypes[i];
            const existingType = await Type.findOne({
                where: { name: type.name },
            });

            if (!existingType) {
                await Type.create(type);
            }
        }

        const allTypes = await Type.findAll({
            order: [["name", "ASC"]],
        });

        res.status(OK).json(allTypes);
    } catch (error) {
        res.status(err).json({ error: error.message });
    }
};

module.exports = {
    getTypesHandler
};
