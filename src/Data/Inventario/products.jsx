import axios from 'axios';
import Cookies from 'js-cookie';

const createOptions = (items, key) => {
  const uniqueItems = [...new Set(items.map(item => item[key]))];
  return uniqueItems.map(item => ({ value: item.toLowerCase(), label: item }));
};

export const fetchProducts = async () => {
  const token = Cookies.get('authToken'); // Asegúrate de que esto se llame "authToken" como en tu uso de cookies

  const config = {
    method: 'get',
    url: 'https://cheveposapi.codelabs.com.mx/Endpoints/Gets/getProductsInventory.php',
    headers: {
      'Authorization': `Bearer ${token}` // Añade el token como Bearer token en los headers
    }
  };

  try {
    const response = await axios.request(config);

    if (response.data.success) {
      const data = response.data.products;
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
export const fetchProductsPOS = async () => {
  const token = Cookies.get('authToken'); // Asegúrate de que esto se llame "authToken" como en tu uso de cookies

  const config = {
    method: 'get',
    url: 'https://cheveposapi.codelabs.com.mx/Endpoints/Gets/getProductsPOS.php',
    headers: {
      'Authorization': `Bearer ${token}` // Añade el token como Bearer token en los headers
    }
  };

  try {
    const response = await axios.request(config);

    if (response.data.success) {
      const data = response.data.products;
      return data;
    } else {
      return { success: false, message: response.data.message };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};
export const fetchProductsByID = async (id) => {
  const token = Cookies.get('authToken'); // Asegúrate de que esto se llame "authToken" como en tu uso de cookies
  const formData = new FormData();
  formData.append("IDProduct", id);
  const config = {
    method: 'post',
    url: 'https://cheveposapi.codelabs.com.mx/Endpoints/Gets/getProductBYID.php',
    headers: {
      'Authorization': `Bearer ${token}` // Añade el token como Bearer token en los headers
    },
    data:formData
  };

  try {
    const response = await axios.request(config);

    if (response.data.success) {
      const data = response.data.Data[0];


      return data;
    } else {
      return { success: false, message: response.data.message };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};
