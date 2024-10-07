import axios from 'axios';
import Cookies from 'js-cookie';

// Función para crear opciones únicas a partir de una lista de productos y una clave
const createOptions = (items, key) => {
  const uniqueItems = [...new Set(items.map(item => item[key]))];
  return uniqueItems.map(item => ({ value: item.toLowerCase(), label: item }));
};

export const fetchLowStock = async () => {
  const token = Cookies.get('authToken');

  const config = {
    method: 'get',
    url: 'https://cheveposapi.codelabs.com.mx/Endpoints/Gets/getLowStock.php',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };

  try {
    const response = await axios.request(config);

    if (response.data.success) {
      const data = response.data.Data;
      const options = {
        Categoria: createOptions(data, 'Categoria'),
        Subcategoria: createOptions(data, 'Subcategoria'),
        Unidad: createOptions(data, 'Unidad'),
        precio_compra: createOptions(data, 'precio_compra'),
      };

      return { data, options };
    } else {
      return { success: false, message: response.data.message };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};

export const fetchOUTStock = async () => {
  const token = Cookies.get('authToken');

  const config = {
    method: 'get',
    url: 'https://cheveposapi.codelabs.com.mx/Endpoints/Gets/getOutStock.php',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };

  try {
    const response = await axios.request(config);

    if (response.data.success) {
      const data = response.data.Data;
      const options = {
        Categoria: createOptions(data, 'Categoria'),
        Subcategoria: createOptions(data, 'Subcategoria'),
        Unidad: createOptions(data, 'Unidad'),
        precio_compra: createOptions(data, 'precio_compra'),
      };

      return { data, options };
    } else {
      return { success: false, message: response.data.message };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};
