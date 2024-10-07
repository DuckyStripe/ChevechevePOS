import React, { useEffect, useState } from "react";
import {
  File,
  User,
  UserCheck
} from "feather-icons-react/build/IconComponents";
import Chart from "react-apexcharts";
import { Link } from "react-router-dom";
import ImageWithGenericUrlCheve from "../../core/img/imagewithURLCheve";
import ImageWithBasePath from "../../core/img/imagewithURL";
import { all_routes } from "../../Router/all_routes";
// import withReactContent from "sweetalert2-react-content";
// import Swal from "sweetalert2";
import {
  fetchProducts,
  fetchRecentPurchaseProducts,
  fetchDashboardData,
  fetchDataProfit
} from "../../Data/Dashboard";

const Dashboard = () => {
  const [products, setProducts] = useState([]);
  const route = all_routes;
  const [recentPurchases, setrecentPurchases] = useState([]);
  const [datadash, setdatadash] = useState([]);
  const [profit, setprofit] = useState(null); // Inicializamos como null
  const [chartOptions, setChartOptions] = useState({
    series: [],
    colors: ["#28C76F", "#EA5455"],
    chart: {
      type: "bar",
      height: 320,
      stacked: true,
      zoom: {
        enabled: true
      }
    },
    responsive: [
      {
        breakpoint: 280,
        options: {
          legend: {
            position: "bottom",
            offsetY: 0
          }
        }
      }
    ],
    plotOptions: {
      bar: {
        horizontal: false,
        borderRadius: 4,
        borderRadiusApplication: "end",
        borderRadiusWhenStacked: "all",
        columnWidth: "20%"
      }
    },
    dataLabels: {
      enabled: false
    },
    yaxis: {
      min: -200,
      max: 300,
      tickAmount: 5
    },
    xaxis: {
      categories: []
    },
    legend: { show: false },
    fill: {
      opacity: 1
    }
  });

  // Estado para manejar el año seleccionado
  const [selectedYear, setSelectedYear] = useState(null);

  useEffect(() => {
    const loadRecentProducts = async () => {
      const data = await fetchRecentPurchaseProducts();
      setrecentPurchases(data);
    };

    const loadDataDash = async () => {
      const data = await fetchDashboardData();

      setdatadash(data[0]);
    };

    const loadProducts = async () => {
      const data = await fetchProducts();
      setProducts(data);
    };

    const loadProfit = async () => {
      const data = await fetchDataProfit();
      setprofit(data);

      // Inicia con el año más reciente
      if (data.years && data.years.length > 0) {
        setSelectedYear(Math.max(...data.years));
      }

      // Suponiendo que `data` sigue el formato especificado en la pregunta,
      // actualizamos chartOptions basado en el año seleccionado:
      if (data && data.data) {
        const selectedYearData = data.data[Math.max(...data.years)];

        const sales = selectedYearData.sales;
        const purchases = selectedYearData.purchases;

        const allValues = [...sales, ...purchases];
        const minValue = Math.min(...allValues);
        const maxValue = Math.max(...allValues);

        setChartOptions(prevOptions => ({
          ...prevOptions,
          series: [
            { name: "Sales", data: sales },
            { name: "Purchases", data: purchases }
          ],
          yaxis: {
            ...prevOptions.yaxis,
            min: minValue,
            max: maxValue
          },
          xaxis: {
            ...prevOptions.xaxis,
            categories: data.categories
          }
        }));
      }
    };

    loadRecentProducts();
    loadProducts();
    loadDataDash();
    loadProfit();
  }, []);

  useEffect(() => {
    if (profit && selectedYear) {
      const yearData = profit.data[selectedYear] ?? {
        sales: [],
        purchases: []
      };

      setChartOptions((prevOptions) => ({
        ...prevOptions,
        series: [
          {
            name: "Ventas",
            data: yearData.sales
          },
          {
            name: "Compras",
            data: yearData.purchases
          }
        ],
        xaxis: {
          categories: profit.categories
        }
      }));
    }
  }, [profit, selectedYear]);

  const handleYearChange = (year) => {
    setSelectedYear(year);
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN"
    }).format(value);
  };
  // Obtener el año más reciente de la list
  return (
    <div>
      <div className="page-wrapper">
        <div className="content">
          <div className="row">
            <div className="col-xl-3 col-sm-6 col-12 d-flex">
              <div className="dash-widget w-100">
                <div className="dash-widgetimg">
                  <span>
                    <ImageWithBasePath
                      src="assets/img/icons/dash1.svg"
                      alt="img"
                    />
                  </span>
                </div>
                <div className="dash-widgetcontent">
                  <h5>{formatCurrency(datadash.TotalProducto)}</h5>
                  <h6>Total en Producto</h6>
                </div>
              </div>
            </div>
            <div className="col-xl-3 col-sm-6 col-12 d-flex">
              <div className="dash-widget dash1 w-100">
                <div className="dash-widgetimg">
                  <span>
                    <ImageWithBasePath
                      src="assets/img/icons/dash2.svg"
                      alt="img"
                    />
                  </span>
                </div>
                <div className="dash-widgetcontent">
                  <h5>{formatCurrency(datadash.TotalDinero)}</h5>
                  <h6>Total Dinero</h6>
                </div>
              </div>
            </div>
            <div className="col-xl-3 col-sm-6 col-12 d-flex">
              <div className="dash-widget dash2 w-100">
                <div className="dash-widgetimg">
                  <span>
                    <ImageWithBasePath
                      src="assets/img/icons/dash3.svg"
                      alt="img"
                    />
                  </span>
                </div>
                <div className="dash-widgetcontent">
                  <h5>{formatCurrency(datadash.TotalEgresos)}</h5>
                  <h6>Total Egresos</h6>
                </div>
              </div>
            </div>
            <div className="col-xl-3 col-sm-6 col-12 d-flex">
              <div className="dash-widget dash3 w-100">
                <div className="dash-widgetimg">
                  <span>
                    <ImageWithBasePath
                      src="assets/img/icons/dash4.svg"
                      alt="img"
                    />
                  </span>
                </div>
                <div className="dash-widgetcontent">
                  <h5>{formatCurrency(datadash.TotalVentas)}</h5>
                  <h6>Total Estimado</h6>
                </div>
              </div>
            </div>
            <div className="col-xl-3 col-sm-6 col-12 d-flex">
              <div className="dash-count">
                <div className="dash-counts">
                  <h4> {datadash.Clientes}</h4>
                  <h5>Clientes</h5>
                </div>
                <div className="dash-imgs">
                  <User />
                </div>
              </div>
            </div>
            <div className="col-xl-3 col-sm-6 col-12 d-flex">
              <div className="dash-count das1">
                <div className="dash-counts">
                  <h4>{datadash.Pedidos}</h4>
                  <h5>Pedidos</h5>
                </div>
                <div className="dash-imgs">
                  <UserCheck />
                </div>
              </div>
            </div>
            <div className="col-xl-3 col-sm-6 col-12 d-flex">
              <div className="dash-count das2">
                <div className="dash-counts">
                  <h4>{datadash.TotalProductos}</h4>
                  <h5>Productos</h5>
                </div>
                <div className="dash-imgs">
                  <ImageWithBasePath
                    src="assets/img/icons/file-text-icon-01.svg"
                    className="img-fluid"
                    alt="icon"
                  />
                </div>
              </div>
            </div>
            <div className="col-xl-3 col-sm-6 col-12 d-flex">
              <div className="dash-count das3">
                <div className="dash-counts">
                  <h4>{datadash.LOGS}</h4>
                  <h5>LOGS</h5>
                </div>
                <div className="dash-imgs">
                  <File />
                </div>
              </div>
            </div>
          </div>
          {/* Button trigger modal */}

          <div className="row">
            <div className="col-xl-7 col-sm-12 col-12 d-flex">
              <div className="card flex-fill">
                <div className="card-header d-flex justify-content-between align-items-center">
                  <h5 className="card-title mb-0">Ventas vs Compras</h5>
                  <div className="graph-sets">
                    <ul className="mb-0">
                      <li>
                        <span>Ventas</span>
                      </li>
                      <li>
                        <span>Compras</span>
                      </li>
                    </ul>
                    <div className="dropdown dropdown-wraper">
                      <button
                        className="btn btn-light btn-sm dropdown-toggle"
                        type="button"
                        id="dropdownMenuButton"
                        data-bs-toggle="dropdown"
                        aria-expanded="false"
                      >
                        {selectedYear || "Selecciona un año"}
                      </button>
                      <ul
                        className="dropdown-menu"
                        aria-labelledby="dropdownMenuButton"
                      >
                        {profit?.years?.map((year) => (
                          <li key={year}>
                            <Link
                              to="#"
                              className="dropdown-item"
                              onClick={() => handleYearChange(year)}
                            >
                              {year}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
                <div className="card-body">
                  <div id="sales_charts" />
                  <Chart
                    options={chartOptions}
                    series={chartOptions.series}
                    type="bar"
                    height={320}
                  />
                </div>
              </div>
            </div>
            <div className="col-xl-5 col-sm-12 col-12 d-flex">
              <div className="card flex-fill default-cover mb-4">
                <div className="card-header d-flex justify-content-between align-items-center">
                  <h4 className="card-title mb-0">Compras recientes</h4>
                  <div className="view-all-link"></div>
                </div>
                <div className="card-body">
                  <div className="table-responsive dataview">
                    <table className="table dashboard-recent-products">
                      <thead>
                        <tr>
                          <th>Cantidad</th>
                          <th>Productos</th>
                          <th>Precio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentPurchases.map((purchase) => (
                          <tr key={purchase.id}>
                            <td>{purchase.cantidad}</td>
                            <td className="productimgname">
                              <Link
                                to={route.productlist}
                                className="product-img"
                              >
                                <ImageWithGenericUrlCheve
                                  src={purchase.imagen_producto}
                                  alt="product"
                                />
                              </Link>
                              <Link to={route.productlist}>
                                {purchase.nombre_producto}
                              </Link>
                            </td>
                            <td>${purchase.precio_compra}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-header">
              <h4 className="card-title">Inventario Bajo</h4>
            </div>
            <div className="card-body">
              <div className="table-responsive dataview">
                <table className="table dashboard-expired-products">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Cantidad</th>
                      <th>Ultima Compra</th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <tr key={product.id}>
                        <td>
                          <div className="productimgname">
                            <Link to="#" className="product-img stock-img">
                              <ImageWithGenericUrlCheve
                                src={product.imagen_producto}
                                alt="product"
                              />
                            </Link>
                            <Link to="#">{product.nombre_producto}</Link>
                          </div>
                        </td>
                        <td>
                          <Link to="#">{product.cantidad}</Link>
                        </td>
                        <td>{product.FechaActualizacion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
