import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Select from "react-select";
import AddCategory from "../../modals/inventory/addcategory";
import ImageWithGenericUrlCheve from "../../img/imagewithURLCheve";
import {
  fetchCategories,
  fetchSubCategories,
  fetchUnidad,
} from "../../../Data/Inventario/category"; // I
import {
  ChevronDown,
  Info,
  LifeBuoy,
  PlusCircle,
  X,
} from "feather-icons-react/build/IconComponents";
import { ToastContainer, toast } from "react-toastify";
import axios from "axios";
import Cookies from "js-cookie";
import PropTypes from "prop-types";

const EditProduct = ({ DataProducto }) => {
  const [options, setOptions] = useState({
    Categoria: [],
    Subcategoria: [],
    Unidad: [],
  });
  const [productData, setProductData] = useState({
    id: 0,
    nombre_producto: "",
    Categoria: 0,
    Subcategoria: 0,
    Unidad: 0,
    precio_compra: "",
    precio_venta: "",
    cantidad: 0,
    cantidadMinima: 0,
    imagen_producto: "",
    creado_en: "",
    FechaActualizacion: "",
  });

  const [previewImage, setPreviewImage] = useState(null);
  const [isNewImage, setIsNewImage] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Llama a las funciones de fetch y espera las promesas
        const categorias = await fetchCategories();
        const subcategorias = await fetchSubCategories();
        const unidades = await fetchUnidad();

        // Actualiza el estado con los resultados de las llamadas
        setOptions({
          Categoria: categorias,
          Subcategoria: subcategorias,
          Unidad: unidades,
        });
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };

    fetchData();

    // Asegúrate de que DataProducto esté definido y existe antes de la conversión
    if (DataProducto) {
      // Actualiza productData con valores numéricos para precio_compra y precio_venta
      setProductData({
        ...DataProducto,
        precio_compra: parseFloat(DataProducto.precio_compra) || 0, // Convierte a número
        precio_venta: parseFloat(DataProducto.precio_venta) || 0, // Convierte a número
      });
    }
  }, [DataProducto]); // Volver a ejecutar si DataProducto cambia

  // Función para eliminar la imagen cargada
  const handleRemoveImage = () => {
    setPreviewImage(null); // Elimina la vista previa de la interfaz

    setProductData((prevData) => ({
      ...prevData,
      imagen_producto: "", // Intenta usar null si eso se ajusta mejor a tu lógica
    }));
  };
  useEffect(() => {}, [productData]);

  const handleImageChange = (event) => {
    const file = event.target.files[0];

    if (file) {
      setProductData((prevData) => ({
        ...prevData,
        imagen: file,
      }));

      const reader = new FileReader();

      reader.onloadend = () => {
        setPreviewImage(reader.result); // Actualiza la vista previa
        setIsNewImage(true); // Marca la imagen como nueva
      };

      reader.readAsDataURL(file);
    }
  };

  const validateFormData = () => {
    const errors = {};

    // Validación para nombre: letras y números
    if (!productData.nombre_producto) {
      errors.nombre_producto = "El nombre es requerido.";
    } else if (!/^[a-zA-Z0-9\s]+$/.test(productData.nombre_producto)) {
      errors.nombre_producto =
        "El nombre solo puede contener letras y números.";
    }

    // Validación para las IDs de unidad, categoría y subcategoría
    if (!productData.Unidad) {
      errors.Unidad = "La unidad es requerida.";
    }

    if (!productData.Categoria) {
      errors.Categoria = "La categoría es requerida.";
    }

    if (!productData.Subcategoria) {
      errors.subcategoria = "La subcategoría es requerida.";
    }

    // Validación para precios: deben ser números
    if (!productData.precio_compra) {
      errors.precio_compra = "El precio de costo es requerido.";
    } else if (isNaN(productData.precio_compra)) {
      errors.precio_compra = "El precio de costo debe ser un número.";
    }

    if (!productData.precio_venta) {
      errors.precio_venta = "El precio de venta es requerido.";
    } else if (isNaN(productData.precio_venta)) {
      errors.precio_venta = "El precio de venta debe ser un número.";
    }

    // Validación para cantidades: solo números
    if (!productData.cantidad) {
      errors.cantidad = "La cantidad actual es requerida.";
    } else if (!/^\d+$/.test(productData.cantidad)) {
      errors.cantidad = "La cantidad actual debe ser un número.";
    }

    if (!productData.cantidadMinima) {
      errors.cantidadMinima = "La cantidad mínima es requerida.";
    } else if (!/^\d+$/.test(productData.cantidadMinima)) {
      errors.cantidadMinima = "La cantidad mínima debe ser un número.";
    }

    return errors;
  };

  const handleFormSubmit = async () => {
    const errors = validateFormData();

    if (Object.keys(errors).length > 0) {
      Object.values(errors).forEach((error) => {
        toast.error(error);
      });
      return;
    }

    const token = Cookies.get("authToken");

    const formData = new FormData();
    formData.append("productId", productData.id);
    formData.append("Categoria", productData.Categoria);
    formData.append("Subcategoria", productData.Subcategoria);
    formData.append("Unidad", productData.Unidad);
    formData.append("cantidad", productData.cantidad);
    formData.append("cantidadMinima", productData.cantidadMinima);
    formData.append("nombre_producto", productData.nombre_producto);
    formData.append("nombre_usuario", productData.nombre_usuario);
    formData.append("precio_compra", productData.precio_compra);
    formData.append("precio_venta", productData.precio_venta);

    // Adjuntar archivo de la imagen si `isNewImage` es verdadero.
    if (isNewImage && productData.imagen instanceof File) {
      formData.append("imagen_producto", productData.imagen);
    }
    formData.append("isNewImage", isNewImage);

    const config = {
      method: "post",
      url: "https://cheveposapi.codelabs.com.mx/Endpoints/Update/UpdateProducto.php",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data: formData,
    };

    try {
      const response = await axios.request(config);

      if (response.data.success) {
        toast.success("Producto actualizao correctamente.");
        // Limpiar o redirigir según sea necesario
        window.location.reload();
      } else {
        toast.error(`Error: ${response.data.message}`);
      }
    } catch (error) {
      toast.error(`Error: ${error.message}`);
    }
  };

  const closemodal = () => {
    setProductData({
      nombre: "",
      unidad: null,
      categoria: null,
      subcategoria: null,
      precioCosto: "",
      precioVenta: "",
      precioMayoreo: "",
      cantidadActual: "",
      cantidadMinima: "",
      imagen: null,
    });
    setPreviewImage(null);
    setIsNewImage(false);
  };
  return (
    <div>
      <ToastContainer />
      <div className="modal fade" id="edit-product">
        <div className="modal-dialog modal-dialog-centered custom-modal-two">
          <div className="modal-content">
            <div className="page-wrapper-new p-0">
              <div className="content">
                <div className="modal-header border-0 custom-modal-header">
                  <div className="page-title">
                    <h4>Editar Producto</h4>{" "}
                  </div>
                </div>
                {/* /add */}
                <div className="modal-body custom-modal-body">
                  <form>
                    <div className="card">
                      <div className="card-body add-product pb-0">
                        <div
                          className="accordion-card-one accordion"
                          id="accordionExample"
                        >
                          <div className="accordion-item">
                            <div className="accordion-header" id="headingOne">
                              <div
                                className="accordion-button"
                                data-bs-toggle="collapse"
                                data-bs-target="#collapseOne"
                                aria-controls="collapseOne"
                              >
                                <div className="addproduct-icon">
                                  <h5>
                                    <Info className="add-info" />

                                    <span>Informacion del Producto</span>
                                  </h5>
                                  <Link to="#">
                                    <ChevronDown className="chevron-down-add" />
                                  </Link>
                                </div>
                              </div>
                            </div>
                            <div
                              id="collapseOne"
                              className="accordion-collapse collapse show"
                              aria-labelledby="headingOne"
                              data-bs-parent="#accordionExample"
                            >
                              <div className="accordion-body">
                                <div className="row">
                                  <div className="col-lg-12 col-sm-6 col-12">
                                    <div className="mb-3 add-product">
                                      <label className="form-label">
                                        Nombre del Producto
                                      </label>
                                      {productData && (
                                        <input
                                          type="text"
                                          className="form-control"
                                          value={
                                            productData.nombre_producto || ""
                                          }
                                          onChange={(e) =>
                                            setProductData({
                                              ...productData,
                                              nombre_producto: e.target.value,
                                            })
                                          }
                                        />
                                      )}
                                    </div>
                                  </div>
                                  <div className="col-lg-4 col-sm-6 col-12">
                                    <div className="mb-3 add-product">
                                      <label className="form-label">
                                        Unidad
                                      </label>
                                      {productData && (
                                        <Select
                                          classNamePrefix="react-select"
                                          options={options.Unidad}
                                          value={options.Unidad.find(
                                            (option) =>
                                              option.value ===
                                              productData.Unidad // Compara con value
                                          )}
                                          onChange={(selectedOption) =>
                                            setProductData((prevData) => ({
                                              ...prevData,
                                              Unidad: selectedOption.value, // Guarda el value
                                            }))
                                          }
                                          placeholder="Elegir"
                                        />
                                      )}
                                    </div>
                                  </div>
                                  {/* Categoria */}
                                  <div className="col-lg-4 col-sm-6 col-12">
                                    <div className="mb-3 add-product">
                                      <label className="form-label">
                                        Categoria
                                      </label>
                                      {productData && (
                                        <Select
                                          classNamePrefix="react-select"
                                          options={options.Categoria || []} // Manejo seguro
                                          value={(options.Categoria || []).find(
                                            (option) =>
                                              option.value ===
                                              productData.Categoria // Compara con value
                                          )}
                                          onChange={(selectedOption) =>
                                            setProductData((prevData) => ({
                                              ...prevData,
                                              Categoria: selectedOption.value, // Guarda el value
                                            }))
                                          }
                                          placeholder="Elegir"
                                        />
                                      )}
                                    </div>
                                  </div>
                                  <div className="col-lg-4 col-sm-6 col-12">
                                    <div className="mb-3 add-product">
                                      <label className="form-label">
                                        SubCategoria
                                      </label>
                                      {productData && (
                                        <Select
                                          classNamePrefix="react-select"
                                          options={options.Subcategoria || []} // Manejo seguro
                                          value={(
                                            options.Subcategoria || []
                                          ).find(
                                            (option) =>
                                              option.value ===
                                              productData.Subcategoria // Compara con value
                                          )}
                                          onChange={(selectedOption) =>
                                            setProductData((prevData) => ({
                                              ...prevData,
                                              Subcategoria:
                                                selectedOption.value, // Guarda el value
                                            }))
                                          }
                                          placeholder="Elegir"
                                        />
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div
                          className="accordion-card-one accordion"
                          id="accordionExample2"
                        >
                          <div className="accordion-item">
                            <div className="accordion-header" id="headingTwo">
                              <div
                                className="accordion-button"
                                data-bs-toggle="collapse"
                                data-bs-target="#collapseTwo"
                                aria-controls="collapseTwo"
                              >
                                <div className="text-editor add-list">
                                  <div className="addproduct-icon list icon">
                                    <h5>
                                      <LifeBuoy className="add-info" />
                                      <span>Precios y Stock</span>
                                    </h5>
                                    <Link to="#">
                                      <ChevronDown className="chevron-down-add" />
                                    </Link>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div
                              id="collapseTwo"
                              className="accordion-collapse collapse show"
                              aria-labelledby="headingTwo"
                              data-bs-parent="#accordionExample2"
                            >
                              <div className="accordion-body">
                                <div
                                  className="tab-content"
                                  id="pills-tabContent"
                                >
                                  <div
                                    className="tab-pane fade show active"
                                    id="pills-home"
                                    role="tabpanel"
                                    aria-labelledby="pills-home-tab"
                                  >
                                    <div className="row">
                                      <div className="col-lg-6 col-sm-6 col-12">
                                        <div className="input-blocks add-product">
                                          <label>Precio Costo</label>
                                          {productData && (
                                            <input
                                              type="text"
                                              className="form-control"
                                              value={
                                                productData.precio_compra || ""
                                              }
                                              onChange={(e) =>
                                                setProductData({
                                                  ...productData,
                                                  precio_compra:
                                                    parseFloat(
                                                      e.target.value
                                                    ) || 0, // Conviertes a número
                                                })
                                              }
                                            />
                                          )}
                                        </div>
                                      </div>

                                      <div className="col-lg-6 col-sm-6 col-12">
                                        <div className="input-blocks add-product">
                                          <label>Precio Venta</label>
                                          {productData && (
                                            <input
                                              type="text"
                                              className="form-control"
                                              value={
                                                productData.precio_venta || ""
                                              }
                                              onChange={(e) =>
                                                setProductData({
                                                  ...productData,
                                                  precio_venta:
                                                    parseFloat(
                                                      e.target.value
                                                    ) || 0, // Conviertes a número
                                                })
                                              }
                                            />
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="row">
                                      <div className="col-lg-6 col-sm-6 col-12">
                                        <div className="input-blocks add-product">
                                          <label>Cantidad Actual </label>
                                          {productData && (
                                            <input
                                              type="text"
                                              className="form-control"
                                              value={productData.cantidad || ""}
                                              onChange={(e) =>
                                                setProductData({
                                                  ...productData,
                                                  cantidad: e.target.value,
                                                })
                                              }
                                            />
                                          )}
                                        </div>
                                      </div>
                                      <div className="col-lg-6 col-sm-6 col-12">
                                        <div className="input-blocks add-product">
                                          <label>Cantidad Minima</label>
                                          {productData && (
                                            <input
                                              type="text"
                                              className="form-control"
                                              value={
                                                productData.cantidadMinima || ""
                                              }
                                              onChange={(e) =>
                                                setProductData({
                                                  ...productData,
                                                  cantidadMinima:
                                                    e.target.value,
                                                })
                                              }
                                            />
                                          )}
                                        </div>
                                      </div>
                                      <div
                                        className="accordion-card-one accordion"
                                        id="accordionExample3"
                                      >
                                        <div className="accordion-item">
                                          <div
                                            className="accordion-header"
                                            id="headingThree"
                                          >
                                            <div
                                              className="accordion-button"
                                              data-bs-toggle="collapse"
                                              data-bs-target="#collapseThree"
                                              aria-controls="collapseThree"
                                            >
                                              <div className="addproduct-icon list">
                                                <h5>
                                                  <i
                                                    data-feather="image"
                                                    className="add-info"
                                                  />
                                                  <span>Imagenes</span>
                                                </h5>
                                                <Link to="#">
                                                  <ChevronDown className="chevron-down-add" />
                                                </Link>
                                              </div>
                                            </div>
                                          </div>
                                          <div
                                            id="collapseThree"
                                            className="accordion-collapse collapse show"
                                            aria-labelledby="headingThree"
                                            data-bs-parent="#accordionExample3"
                                          >
                                            <div className="accordion-body">
                                              <div className="text-editor add-list add">
                                                <div className="col-lg-12">
                                                  <div className="add-choosen">
                                                    <div className="input-blocks">
                                                      <div className="image-upload">
                                                        <input
                                                          type="file"
                                                          onChange={
                                                            handleImageChange
                                                          }
                                                        />
                                                        <div className="image-uploads">
                                                          <PlusCircle className="plus-down-add me-0" />
                                                          <h4>Añadir Imagen</h4>
                                                        </div>
                                                      </div>
                                                    </div>
                                                    {isNewImage
                                                      ? previewImage && (
                                                          <div className="phone-img">
                                                            <img
                                                              src={previewImage}
                                                              alt="Vista previa"
                                                            />
                                                            <Link to="#">
                                                              <X
                                                                className="x-square-add remove-product"
                                                                onClick={
                                                                  handleRemoveImage
                                                                }
                                                              />
                                                            </Link>
                                                          </div>
                                                        )
                                                      : productData &&
                                                        productData.imagen_producto && (
                                                          <div className="phone-img">
                                                            <ImageWithGenericUrlCheve
                                                              src={
                                                                productData.imagen_producto
                                                              }
                                                              alt="Vista previa"
                                                            />
                                                            <Link to="#">
                                                              <X
                                                                className="x-square-add remove-product"
                                                                onClick={
                                                                  handleRemoveImage
                                                                }
                                                              />
                                                            </Link>
                                                          </div>
                                                        )}
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div
                          className="accordion-card-one accordion"
                          id="accordionExample4"
                        ></div>
                      </div>
                    </div>
                    <div className="modal-footer-btn">
                      <button
                        type="button"
                        className="btn btn-cancel me-2"
                        data-bs-dismiss="modal"
                        onClick={closemodal}
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn btn-submit"
                        onClick={handleFormSubmit} // Quita la flecha y los paréntesis vacíos
                      >
                        Guardar
                      </button>
                    </div>
                  </form>
                </div>
              </div>
              <AddCategory />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
EditProduct.propTypes = {
  DataProducto: PropTypes.shape({
    id: PropTypes.number.isRequired,
    nombre_producto: PropTypes.string.isRequired,
    Categoria: PropTypes.number.isRequired,
    Subcategoria: PropTypes.number.isRequired,
    Unidad: PropTypes.number.isRequired,
    precio_compra: PropTypes.string.isRequired,
    precio_venta: PropTypes.string.isRequired,
    cantidad: PropTypes.number.isRequired,
    cantidadMinima: PropTypes.number.isRequired,
    imagen_producto: PropTypes.string.isRequired,
    creado_en: PropTypes.string.isRequired,
    FechaActualizacion: PropTypes.string.isRequired,
  }),
};

export default EditProduct;
