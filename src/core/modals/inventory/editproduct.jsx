import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Select from "react-select";
import AddCategory from "../../modals/inventory/addcategory";
// import ImageWithBasePath from "../../core/img/imagewithbasebath";
import ImageWithGenericUrlCheve from "../../img/imagewithURLCheve";
import {
  fetchCategories,
  fetchSubCategories,
  fetchUnidad
} from "../../../Data/Inventario/category"; // I
import {
  ChevronDown,
  Info,
  LifeBuoy,
  PlusCircle,
  X
} from "feather-icons-react/build/IconComponents";
// import {
//   fetchProductsByID,
//   fetchProducts
// } from "../../../Data/Inventario/products";
import { ToastContainer, toast } from "react-toastify";
import axios from "axios";
import Cookies from "js-cookie";
import PropTypes from "prop-types";

const EditProduct = ({ DataProducto }) => {
  const [options, setOptions] = useState({
    Categoria: [],
    Subcategoria: [],
    Unidad: []
  });
  const [productData, setProductData] = useState({
    id: [],
    nombre_producto: [],
    Categoria: [],
    Subcategoria: [],
    Unidad: [],
    precio_compra: [],
    precio_venta: [],
    cantidad: [],
    cantidadMinima: [],
    imagen_producto: [],
    creado_en: [],
    FechaActualizacion: []
  });
  console.log(DataProducto)
  const [previewImage, setPreviewImage] = useState(true);
  const handleImageChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Llamadas a las funciones de fetch, espera las Promises
        const categorias = await fetchCategories();
        const subcategorias = await fetchSubCategories();
        const unidades = await fetchUnidad();

        // Actualizar el estado con los resultados de las llamadas
        setOptions({
          Categoria: categorias,
          Subcategoria: subcategorias,
          Unidad: unidades
        });
      } catch (error) {
        console.error("Error fetching data:", error);
      }
    };
    fetchData();
    setProductData(DataProducto);
  }, [DataProducto]);

  // Función para eliminar la imagen cargada
  const handleRemoveImage = () => {
    setPreviewImage(null);
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
    if (!productData.Unidad?.value) {
      errors.Unidad = "La unidad es requerida.";
    }

    if (!productData.Categoria?.value) {
      errors.Categoria = "La categoría es requerida.";
    }

    if (!productData.Subcategoria?.value) {
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

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    console.log("Data Producto", productData);
    const errors = validateFormData();

    if (Object.keys(errors).length > 0) {
      Object.values(errors).forEach((error) => {
        toast.error(error); // Usa react-toastify para mostrar los errores
      });
      return;
    }
    const formData = new FormData();
    formData.append("productId", productData.id);
    formData.append("Categoria", productData.Categoria);
    formData.append("Subcategoria", productData.Subcategoria);
    formData.append("Unidad", productData.Unidad);
    formData.append("cantidad", productData.cantidad);
    formData.append("cantidadMinima", productData.cantidadMinima);
    formData.append("imagen_producto", productData.imagen_producto);
    formData.append("nombre_producto", productData.nombre_producto);
    formData.append("nombre_usuario", productData.nombre_usuario);
    formData.append("precio_compra", productData.precio_compra);
    formData.append("precio_venta", productData.precio_venta);
    // const token = Cookies.get("authToken");

    // const config = {
    //   method: "post",
    //   url: "https://cheveposapi.codelabs.com.mx/Endpoints/Update/UpdateCliente.php",
    //   headers: {
    //     Authorization: `Bearer ${token}`,
    //     "Content-Type": "application/json"
    //   },
    //   data:formData
    // };

    
    // try {
        console.log(formData);
    //   const response = await axios.request(config);

    //   if (response.data.success) {
    //     console.log(productData);
    //     toast.success("Producto insertado correctamente.");

        // // Limpiar los datos del modal
        // setProductData({
        //     nombre: "",
        //     unidad: null,
        //     categoria: null,
        //     subcategoria: null,
        //     precioCosto: "",
        //     precioVenta: "",
        //     cantidadActual: "",
        //     cantidadMinima: "",
        //     imagen: null
        // });
        // navigate(all_routes.productlist);
    //   } else {
    //     toast.error(`Error: ${response.data.message}`);
    //   }
    // } catch (error) {
    //   toast.error(`Error: ${error.message}`);
    // }
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
                                              nombre_producto: e.target.value
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
                                              option.label == productData.Unidad
                                          )}
                                          onChange={(selectedOption) =>
                                            setProductData((prevData) => ({
                                              ...prevData,
                                              Unidad: selectedOption.label
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
                                              option.etiqueta ===
                                              productData?.options?.Categoria // Manejo seguro
                                          )}
                                          onChange={(selectedOption) =>
                                            setProductData((prevData) => ({
                                              ...prevData,
                                              options: {
                                                ...prevData.options,
                                                Categoria: selectedOption.label
                                              }
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
                                                option.etiqueta ===
                                                productData?.options
                                                  ?.Subcategoria // Manejo seguro
                                            )}
                                            onChange={(selectedOption) =>
                                              setProductData((prevData) => ({
                                                ...prevData,
                                                options: {
                                                  ...prevData.options,
                                                  Subcategoria:
                                                    selectedOption.label
                                                }
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
                                                  precio_compra: e.target.value
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
                                                  precio_venta: e.target.value
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
                                                  cantidad: e.target.value
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
                                                  cantidadMinima: e.target.value
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
                                                    {previewImage &&
                                                      productData &&
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
                      <button type="button" className="btn btn-cancel me-2"
                                       data-bs-dismiss="modal">
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn btn-submit"
                        onClick={() => handleFormSubmit}
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
    Categoria: PropTypes.string.isRequired,
    Subcategoria: PropTypes.string.isRequired,
    Unidad: PropTypes.string.isRequired,
    precio_compra: PropTypes.string.isRequired,
    precio_venta: PropTypes.string.isRequired,
    cantidad: PropTypes.number.isRequired,
    cantidadMinima: PropTypes.number.isRequired,
    imagen_producto: PropTypes.string.isRequired,
    creado_en: PropTypes.string.isRequired,
    FechaActualizacion: PropTypes.string.isRequired
  })
};

export default EditProduct;
