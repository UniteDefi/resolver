#include <counter.hpp>

ACTION counter::increment(name user) {
    require_auth(user);

    counters_table counters(get_self(), get_self().value);
    auto iterator = counters.find(user.value);
    
    if (iterator == counters.end()) {
        // Create new counter
        counters.emplace(user, [&](auto& row) {
            row.user = user;
            row.value = 1;
            row.last_modified = current_time_point().sec_since_epoch();
        });
        
        // Send notification
        require_recipient(user);
        counter::notify_action notify_act(get_self(), {get_self(), "active"_n});
        notify_act.send(user, 1);
    } else {
        // Update existing counter
        counters.modify(iterator, user, [&](auto& row) {
            row.value += 1;
            row.last_modified = current_time_point().sec_since_epoch();
        });
        
        // Send notification
        require_recipient(user);
        counter::notify_action notify_act(get_self(), {get_self(), "active"_n});
        notify_act.send(user, iterator->value);
    }
}

ACTION counter::decrement(name user) {
    require_auth(user);

    counters_table counters(get_self(), get_self().value);
    auto iterator = counters.find(user.value);
    
    check(iterator != counters.end(), "Counter does not exist for this user");
    check(iterator->value > 0, "Counter cannot be negative");
    
    counters.modify(iterator, user, [&](auto& row) {
        row.value -= 1;
        row.last_modified = current_time_point().sec_since_epoch();
    });
    
    // Send notification
    require_recipient(user);
    counter::notify_action notify_act(get_self(), {get_self(), "active"_n});
    notify_act.send(user, iterator->value);
}

ACTION counter::reset(name user) {
    require_auth(user);

    counters_table counters(get_self(), get_self().value);
    auto iterator = counters.find(user.value);
    
    check(iterator != counters.end(), "Counter does not exist for this user");
    
    counters.modify(iterator, user, [&](auto& row) {
        row.value = 0;
        row.last_modified = current_time_point().sec_since_epoch();
    });
    
    // Send notification
    require_recipient(user);
    counter::notify_action notify_act(get_self(), {get_self(), "active"_n});
    notify_act.send(user, 0);
}

ACTION counter::getvalue(name user) {
    counters_table counters(get_self(), get_self().value);
    auto iterator = counters.find(user.value);
    
    if (iterator != counters.end()) {
        print("Counter value for ", user, ": ", iterator->value);
    } else {
        print("No counter found for ", user);
    }
}

ACTION counter::notify(name user, uint64_t value) {
    require_auth(get_self());
    require_recipient(user);
}