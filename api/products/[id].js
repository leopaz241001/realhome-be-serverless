import { getProductById } from "../../controllers/product.controller";

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return getProductById(req, res);
  }

  res.status(405).json({ message: 'Method Not Allowed' });
} // router.get('/products/:id', getProductById);