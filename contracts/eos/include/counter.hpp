#pragma once

#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include <eosio/system.hpp>

using namespace eosio;
using namespace std;

CONTRACT counter : public contract {
  public:
    using contract::contract;

    // Actions
    ACTION increment(name user);
    ACTION decrement(name user);
    ACTION reset(name user);
    ACTION getvalue(name user);

    // Inline action to notify value changes
    ACTION notify(name user, uint64_t value);

  private:
    // Table definition
    TABLE counters {
      name user;
      uint64_t value;
      uint64_t last_modified;

      uint64_t primary_key() const { return user.value; }
    };

    typedef multi_index<"counters"_n, counters> counters_table;
};