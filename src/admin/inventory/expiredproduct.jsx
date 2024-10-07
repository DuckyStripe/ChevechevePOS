import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Select from "react-select";
import ImageWithBasePath from "../../core/img/imagewithbasebath";
import Table from "../../core/pagination/datatable";
import { fetchProducts } from "../../Data/Inventario/products"; // Importa la función del mock
import AddInventory from "../../core/modals/inventory/add2inventory";
import ImageWithGenericUrlCheve from "../../core/img/imagewithURLCheve";
// Iconos
import {
  Edit,
  Filter,
  GitMerge,
  StopCircle,
} from "feather-icons-react/build/IconComponents";


const ExpiredProduct = () => {
  const [dataSource, setDataSource] = useState([]);
  const [searchValue, setSearchValue] = useState(""); // Estado para el término de búsqueda
  const [filteredData, setFilteredData] = useState([]); // Para almacenar datos filtrados
  const [options, setOptions] = useState({
    Categoria: [],
    Subcategoria: [],
    subCategories: [],
    Unidad: [],
    precio_compra: [],
  });
  const [selectedFilters, setSelectedFilters] = useState({
    Categoria: null,
    Subcategoria: null,
    subCategories: null,
    Unidad: null,
    precio_compra: null,
  });

  useEffect(() => {
    const loadProducts = async () => {
      const products = await fetchProducts();
      setOptions(products.options);
      setDataSource(products.data);
      setFilteredData(products.data);
    };

    loadProducts();
  }, []);

  const handleSearchChange = (event) => {
    const value = event.target.value;
    setSearchValue(value);

    // Filtrar los productos en base al término de búsqueda
    const filtered = dataSource.filter((nombre_producto) =>
      nombre_producto.nombre_producto
        .toLowerCase()
        .includes(value.toLowerCase())
    );
    setFilteredData(filtered);
  };
  const handleSelectChange = (field) => (selectedOption) => {
    setSelectedFilters((prevFilters) => ({
      ...prevFilters,
      [field]: selectedOption ? selectedOption.value : null,
    }));
  };
  const handleSearch = () => {
    // Filtro de productos según los filtros seleccionados
    const filteredProducts = dataSource.filter((nombre_producto) => {
      return (
        (!selectedFilters.Categoria ||
          nombre_producto.Categoria.toLowerCase() ===
            selectedFilters.Categoria.toLowerCase()) &&
        (!selectedFilters.Subcategoria ||
          (nombre_producto.Subcategoria &&
            nombre_producto.Subcategoria.toLowerCase() ===
              selectedFilters.Subcategoria.toLowerCase())) &&
        (!selectedFilters.Unidad ||
          nombre_producto.Unidad.toLowerCase() ===
            selectedFilters.Unidad.toLowerCase()) &&
        (!selectedFilters.precio_compra ||
          nombre_producto.precio_compra === selectedFilters.precio_compra)
      );
    });

    // Actualiza el estado con los productos filtrados
    setFilteredData(filteredProducts);
  };

  const [isFilterVisible, setIsFilterVisible] = useState(false);
  const toggleFilterVisibility = () => {
    setIsFilterVisible((prevVisibility) => !prevVisibility);
  };

  const columns = [
    {
      title: "Producto",
      dataIndex: "nombre_producto",
      render: (text, record) => (
        <span className="productimgname">
          <ImageWithGenericUrlCheve
            alt=""
            src={record.imagen_producto}
            width={50} // Establece el ancho en píxeles
            height={50} // Establece el alto en píxeles
          />
          <p>{text}</p>
        </span>
      ),
      sorter: (a, b) => a.nombre_producto.length - b.nombre_producto.length,
    },
    {
      title: "Categoria",
      dataIndex: "Categoria",
      sorter: (a, b) => a.Categoria.length - b.Categoria.length,
    },
    {
      title: "SubCategoria",
      dataIndex: "Subcategoria",
      sorter: (a, b) => a.Subcategoria.length - b.Subcategoria.length,
    },
    {
      title: "Precio",
      dataIndex: "precio_compra",
      sorter: (a, b) =>
        a.precio_compra.localeCompare(b.precio_compra, undefined, {
          numeric: true,
        }),
    },
    {
      title: "Unidades",
      dataIndex: "Unidad",
      sorter: (a, b) => a.Unidad - b.Unidad,
    },
    {
      title: "Catidad",
      dataIndex: "cantidad",
      sorter: (a, b) => a.cantidad - b.cantidad,
    },
    {
      title: "Creeado por",
      dataIndex: "nombre_usuario",
      render: (text) => (
        <span className="userimgname">
          <p>{text}</p>
        </span>
      ),
      sorter: (a, b) => a.nombre_usuario.length - b.nombre_usuario.length,
    },
    {
      title: "Action",
      dataIndex: "action",
      render: () => (
        <div className="action-table-data">
          <div className="edit-delete-action">
            <div className="input-block add-lists"></div>
            <Link
              to="#"
              data-bs-toggle="modal"
              data-bs-target="#add-units-category"
            >
              <Edit className="feather-edit" />
            </Link>
          </div>
        </div>
      ),
    },
  ];

  const resetFilters = () => {
    setSearchValue("");
    setSelectedFilters({
      Categoria: null,
      Subcategoria: null,
      Unidad: null,
      precio_compra: null,
    });
    setFilteredData(dataSource);
  };

  return (
    <div className="page-wrapper">
      <div className="content">
        <div className="page-header">
          <div className="add-item d-flex">
            <div className="page-title">
              <h4>Inventario</h4>
              <h6>Agrega o quita cantidades</h6>
            </div>
          </div>
        </div>
        <div className="card table-list-card">
          <div className="card-body">
            {/* Búsqueda y Filtros */}
            <div className="table-top">
              <div className="search-set">
                <div className="search-input">
                  <input
                    type="text"
                    placeholder="Buscar"
                    className="form-control form-control-sm formsearch"
                    value={searchValue}
                    onChange={handleSearchChange}
                  />
                  <Link className="btn btn-searchset">
                    <i data-feather="search" className="feather-search" />
                  </Link>
                </div>
              </div>
              <div className="search-path">
                <Link
                  className={`btn btn-filter ${
                    isFilterVisible ? "setclose" : ""
                  }`}
                  onClick={toggleFilterVisibility}
                >
                  <Filter className="filter-icon" />
                  <span>
                    <ImageWithBasePath
                      src="assets/img/icons/closes.svg"
                      alt="img"
                    />
                  </span>
                </Link>
              </div>
            </div>

            <div
              className={`card${isFilterVisible ? " visible" : ""}`}
              style={{ display: isFilterVisible ? "block" : "none" }}
            >
              <div className="card-body pb-0">
                <div className="row">
                  <div className="col-lg-12 col-sm-12">
                    <div className="row">
                      <div className="col-lg-1 col-sm-6 col-12">
                        <div className="input-blocks"></div>
                      </div>
                      <div className="col-lg-2 col-sm-6 col-12">
                        <div className="input-blocks">
                          <StopCircle className="info-img" />
                          <Select
                            className="img-select"
                            classNamePrefix="react-select"
                            options={options.Categoria} // Asegúrate de usar 'Categoria'
                            placeholder="Elegir Categoría"
                            onChange={handleSelectChange("Categoria")}
                            value={
                              options.Categoria?.find(
                                (option) =>
                                  option.value === selectedFilters.Categoria
                              ) || null
                            }
                          />
                        </div>
                      </div>
                      <div className="col-lg-2 col-sm-6 col-12">
                        <div className="input-blocks">
                          <GitMerge className="info-img" />
                          <Select
                            className="img-select"
                            classNamePrefix="react-select"
                            options={options.Subcategoria} // Asegúrate de usar 'Subcategoria'
                            placeholder="Elegir Subcategoría"
                            onChange={handleSelectChange("Subcategoria")} // Asegúrate de que este campo también usa 'Subcategoria'
                            value={
                              options.Subcategoria?.find(
                                (option) =>
                                  option.value === selectedFilters.Subcategoria
                              ) || null
                            }
                          />{" "}
                        </div>
                      </div>
                      <div className="col-lg-2 col-sm-6 col-12">
                        <div className="input-blocks">
                          <StopCircle className="info-img" />
                          <Select
                            className="img-select"
                            classNamePrefix="react-select"
                            options={options.Unidad}
                            placeholder="Elegir Unidad"
                            onChange={handleSelectChange("Unidad")}
                            value={
                              options.Unidad?.find(
                                (option) =>
                                  option.value === selectedFilters.Unidad
                              ) || null
                            }
                          />
                        </div>
                      </div>
                      <div className="col-lg-2 col-sm-6 col-12">
                        <div className="input-blocks">
                          <i className="fas fa-money-bill info-img" />
                          <Select
                            className="img-select"
                            classNamePrefix="react-select"
                            options={options.precio_compra}
                            placeholder="Elegir Precio"
                            onChange={handleSelectChange("precio_compra")}
                            value={
                              options.precio_compra?.find(
                                (option) =>
                                  option.value === selectedFilters.precio_compra
                              ) || null
                            }
                          />
                        </div>
                      </div>

                      <div className="col-lg-1 col-sm-6 col-12">
                        <div className="input-blocks">
                          <button
                            className="btn btn-filters ms-auto"
                            onClick={handleSearch}
                          >
                            <i
                              data-feather="search"
                              className="feather-search"
                            />
                            Buscar
                          </button>
                        </div>
                      </div>
                      <div className="col-lg-1 col-sm-6 col-12">
                        <div className="input-blocks">
                          <button
                            className="btn btn-filters ms-auto" // Añade alguna clase CSS si necesitas estilos específicos
                            onClick={resetFilters}
                          >
                            <i
                              data-feather="rotate-ccw" // Usa un icono adecuado según tu necesidad, aquí como ejemplo
                              className="feather-rotate-ccw"
                            />
                            Limpiar
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="table-responsive">
              <Table columns={columns} dataSource={filteredData} />
            </div>
          </div>
        </div>
        {/* /Product list */}
      </div>
      <AddInventory />
    </div>
  );
};

export default ExpiredProduct;
