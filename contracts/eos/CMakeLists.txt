cmake_minimum_required(VERSION 3.13)
project(counter)

include(ExternalProject)

# Find EOSIO CDT
find_package(eosio.cdt)

add_contract(counter counter src/counter.cpp)

target_include_directories(counter PUBLIC 
    ${CMAKE_SOURCE_DIR}/include
)

# Set the WASM and ABI output directory
set_target_properties(counter
    PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/build"
)