import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Select from "react-select";
import ImageWithBasePath from "../../core/img/imagewithbasebath";
import Table from "../../core/pagination/datatable";
import { fetchProducts, fetchOptions } from "../../Data/Inventario/products"; // Importa la función del mock
import AddInventory from "../../core/modals/inventory/add2inventory";
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
    products: [],
    categories: [],
    subCategories: [],
    brands: [],
    prices: []
  });
  const [selectedFilters, setSelectedFilters] = useState({
    product: null,
    category: null,
    subCategory: null,
    brand: null,
    price: null
  });

  useEffect(() => {
    const loadProducts = async () => {
      const products = await fetchProducts();
      setDataSource(products);
      setFilteredData(products);
    };
    const loadOptions = async () => {
      const data = await fetchOptions();
      setOptions(data);
    };

    loadOptions();
    loadProducts();
  }, []);

  const handleSearchChange = (event) => {
    const value = event.target.value;
    setSearchValue(value);

    // Filtrar los productos en base al término de búsqueda
    const filtered = dataSource.filter((product) =>
      product.product.toLowerCase().includes(value.toLowerCase())
    );
    setFilteredData(filtered);
  };
  const handleSelectChange = (field) => (selectedOption) => {
    setSelectedFilters((prevFilters) => ({
      ...prevFilters,
      [field]: selectedOption ? selectedOption.value : null
    }));
  };
  const handleSearch = () => {
    console.log("dataSource:", dataSource);
    // Filtro de productos según los filtros seleccionados
    const filteredProducts = dataSource.filter((product) => {
      return (
        (!selectedFilters.category ||
          product.category.toLowerCase() ===
            selectedFilters.category.toLowerCase()) &&
        (!selectedFilters.subCategory ||
          (product.subCategory &&
            product.subCategory.toLowerCase() ===
              selectedFilters.subCategory.toLowerCase())) &&
        (!selectedFilters.brand ||
          product.brand.toLowerCase() ===
            selectedFilters.brand.toLowerCase()) &&
        (!selectedFilters.price || product.price === selectedFilters.price)
      );
    });

    // Actualiza el estado con los productos filtrados
    setFilteredData(filteredProducts);
    console.log("Filtered Products:", filteredProducts);
  };


  const [isFilterVisible, setIsFilterVisible] = useState(false);
  const toggleFilterVisibility = () => {
    setIsFilterVisible((prevVisibility) => !prevVisibility);
  };


  const columns = [
    {
      title: "Producto",
      dataIndex: "product",
      render: (text, record) => (
        <span className="productimgname">
          <ImageWithBasePath
            alt=""
            src={record.productImage}
            width={50} // Establece el ancho en píxeles
            height={50} // Establece el alto en píxeles
          />
          <p>{text}</p>
        </span>
      ),
      sorter: (a, b) => a.product.length - b.product.length
    },
    {
      title: "Categoria",
      dataIndex: "category",
      sorter: (a, b) => a.category.length - b.category.length
    },
    {
      title: "SubCategoria",
      dataIndex: "brand",
      sorter: (a, b) => a.brand.length - b.brand.length
    },
    {
      title: "Precio",
      dataIndex: "price",
      sorter: (a, b) =>
        a.price.localeCompare(b.price, undefined, { numeric: true })
    },
    {
      title: "Unidades",
      dataIndex: "unit",
      sorter: (a, b) => a.unit - b.unit
    },
    {
      title: "Catidad",
      dataIndex: "qty",
      sorter: (a, b) => a.qty - b.qty
    },
    {
      title: "Creeado por",
      dataIndex: "createdby",
      render: (text) => (
        <span className="userimgname">
          <p>{text}</p>
        </span>
      ),
      sorter: (a, b) => a.createdby.length - b.createdby.length
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
      sorter: (a, b) => a.createdby.length - b.createdby.length
    }
  ];

  const resetFilters = () => {
    setSearchValue(""); // Limpia el campo de búsqueda
    setSelectedFilters({
      product: null,
      category: null,
      subCategory: null,
      brand: null,
      price: null
    });
    setFilteredData(dataSource); // Restaura la lista original de productos
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
                            options={options.categories} // Asegúrate de usar 'categories', no 'category'
                            placeholder="Elegir Categoría"
                            onChange={handleSelectChange("category")} // Usa la clave correcta
                            value={
                              options.categories?.find(
                                (option) =>
                                  option.value === selectedFilters.category
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
                            options={options.subCategories}
                            placeholder="Elegir Subcategoría"
                            onChange={handleSelectChange("subCategory")}
                            value={
                              options.subCategories?.find(
                                (option) =>
                                  option.value === selectedFilters.subCategory
                              ) || null
                            }
                          />
                        </div>
                      </div>
                      <div className="col-lg-2 col-sm-6 col-12">
                        <div className="input-blocks">
                          <StopCircle className="info-img" />
                          <Select
                            className="img-select"
                            classNamePrefix="react-select"
                            options={options.brands}
                            placeholder="Elegir Marca"
                            onChange={handleSelectChange("brand")}
                            value={
                              options.brands?.find(
                                (option) =>
                                  option.value === selectedFilters.brand
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
                            options={options.prices}
                            placeholder="Elegir Precio"
                            onChange={handleSelectChange("price")}
                            value={
                              options.prices?.find(
                                (option) =>
                                  option.value === selectedFilters.price
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
