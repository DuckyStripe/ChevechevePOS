// products.js
import axios from 'axios';
import Cookies from 'js-cookie';

const createOptions = (items, key) => {
  const uniqueItems = [...new Set(items.map(item => item[key]))];
  return uniqueItems.map(item => ({ value: item, label: item }));
};

export const fetchSales = async (fechaInicio, fechaFin) => {
  const token = Cookies.get('authToken');
  const formData = new FormData();
  formData.append("fecha_inicio", fechaInicio);
  formData.append("fecha_fin", fechaFin);

  // Configuración de solicitud con método POST
  const config = {
    method: 'post',
    url: 'https://cheveposapi.codelabs.com.mx/Endpoints/Gets/getSales.php',
    headers: {
      'Authorization': `Bearer ${token}`,
      // No establezcas 'Content-Type', Axios lo manejará automáticamente
    },
    data: formData // Usa 'data' para enviar el formData
  };

  try {
    const response = await axios.request(config);

    if (response.data.success) {
      const data = response.data.Data;

      // Asegúrate de que las claves sean correctas de acuerdo con la respuesta de la API
      const options = {
        categoria: createOptions(data, 'Categoria'), // Cambié el nombre del option para reflejar la clave correcta
        subcategoria: createOptions(data, 'Subcategoria'),
        unidad: createOptions(data, 'Unidad'),
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
