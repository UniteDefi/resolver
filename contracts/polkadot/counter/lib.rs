#![cfg_attr(not(feature = "std"), no_std)]

#[ink::contract]
mod counter {

    #[ink(storage)]
    pub struct Counter {
        value: u32,
        owner: AccountId,
    }

    #[ink(event)]
    pub struct Incremented {
        #[ink(topic)]
        by: AccountId,
        new_value: u32,
    }

    #[ink(event)]
    pub struct Decremented {
        #[ink(topic)]
        by: AccountId,
        new_value: u32,
    }

    #[derive(Debug, PartialEq, Eq, scale::Encode, scale::Decode)]
    #[cfg_attr(feature = "std", derive(scale_info::TypeInfo))]
    pub enum Error {
        Underflow,
    }

    pub type Result<T> = core::result::Result<T, Error>;

    impl Counter {
        #[ink(constructor)]
        pub fn new(init_value: u32) -> Self {
            let caller = Self::env().caller();
            Self {
                value: init_value,
                owner: caller,
            }
        }

        #[ink(constructor)]
        pub fn default() -> Self {
            Self::new(0)
        }

        #[ink(message)]
        pub fn get(&self) -> u32 {
            self.value
        }

        #[ink(message)]
        pub fn increment(&mut self) {
            self.value = self.value.saturating_add(1);
            self.env().emit_event(Incremented {
                by: self.env().caller(),
                new_value: self.value,
            });
        }

        #[ink(message)]
        pub fn decrement(&mut self) -> Result<()> {
            if self.value == 0 {
                return Err(Error::Underflow);
            }
            self.value -= 1;
            self.env().emit_event(Decremented {
                by: self.env().caller(),
                new_value: self.value,
            });
            Ok(())
        }

        #[ink(message)]
        pub fn get_owner(&self) -> AccountId {
            self.owner
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[ink::test]
        fn default_works() {
            let counter = Counter::default();
            assert_eq!(counter.get(), 0);
        }

        #[ink::test]
        fn new_works() {
            let counter = Counter::new(42);
            assert_eq!(counter.get(), 42);
        }

        #[ink::test]
        fn increment_works() {
            let mut counter = Counter::new(0);
            counter.increment();
            assert_eq!(counter.get(), 1);
            counter.increment();
            assert_eq!(counter.get(), 2);
        }

        #[ink::test]
        fn decrement_works() {
            let mut counter = Counter::new(2);
            assert_eq!(counter.decrement(), Ok(()));
            assert_eq!(counter.get(), 1);
            assert_eq!(counter.decrement(), Ok(()));
            assert_eq!(counter.get(), 0);
        }

        #[ink::test]
        fn decrement_fails_on_underflow() {
            let mut counter = Counter::new(0);
            assert_eq!(counter.decrement(), Err(Error::Underflow));
            assert_eq!(counter.get(), 0);
        }

        #[ink::test]
        fn increment_saturates() {
            let mut counter = Counter::new(u32::MAX);
            counter.increment();
            assert_eq!(counter.get(), u32::MAX);
        }
    }

    #[cfg(all(test, feature = "e2e-tests"))]
    mod e2e_tests {
        use super::*;
        use ink_e2e::ContractsBackend;

        type E2EResult<T> = std::result::Result<T, Box<dyn std::error::Error>>;

        #[ink_e2e::test]
        async fn default_works<Client: E2EBackend>(mut client: Client) -> E2EResult<()> {
            let mut constructor = CounterRef::default();
            let contract = client
                .instantiate("counter", &ink_e2e::alice(), &mut constructor)
                .submit()
                .await
                .expect("instantiate failed");
            let mut call_builder = contract.call_builder::<Counter>();

            let get = call_builder.get();
            let get_result = client.call(&ink_e2e::alice(), &get).dry_run().await?;
            assert_eq!(get_result.return_value(), 0);

            Ok(())
        }

        #[ink_e2e::test]
        async fn increment_decrement_works<Client: E2EBackend>(
            mut client: Client,
        ) -> E2EResult<()> {
            let mut constructor = CounterRef::new(5);
            let contract = client
                .instantiate("counter", &ink_e2e::alice(), &mut constructor)
                .submit()
                .await
                .expect("instantiate failed");
            let mut call_builder = contract.call_builder::<Counter>();

            let increment = call_builder.increment();
            let _ = client
                .call(&ink_e2e::alice(), &increment)
                .submit()
                .await
                .expect("increment failed");

            let get = call_builder.get();
            let get_result = client.call(&ink_e2e::alice(), &get).dry_run().await?;
            assert_eq!(get_result.return_value(), 6);

            let decrement = call_builder.decrement();
            let _ = client
                .call(&ink_e2e::alice(), &decrement)
                .submit()
                .await
                .expect("decrement failed");

            let get = call_builder.get();
            let get_result = client.call(&ink_e2e::alice(), &get).dry_run().await?;
            assert_eq!(get_result.return_value(), 5);

            Ok(())
        }
    }
}