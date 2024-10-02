
const mockProductData = {
  id: 5,
  name: "Producto de ejemplo",
  category: "Modelo",
  subcategory: "Cuarto",
  unit: "Unidad",
  price: 100,
  salePrice: 150,
  wholesalePrice: 140,
  quantity: 50,
  minQuantity: 10,
  image: "https://via.placeholder.com/150" // URL de imagen de ejemplo
};

export const FecthProduct = async (productId) => {
    // Mockup de los datos del producto
    console.log("Product:",productId);
    // Simular espera de una llamada asíncrona
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Establece los datos del producto
    return mockProductData;
  };
